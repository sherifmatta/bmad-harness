import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { guardedStylesheets, literalsIn, withoutComments } from './literal-guard'

/**
 * Story 1.11's rail, asserted from the sources and the stylesheet as text —
 * there is no DOM environment (NFR11's pinned set), so what the contract
 * forbids is held where it would be written. What the rows render is
 * `output-row.test.tsx`'s and `outputs.test.tsx`'s; the fold's is
 * `rail-rows.test.ts`'s.
 */

const ROOT = resolve(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

/** Source with block comments and whole-line `//` comments removed. */
const code = (path: string): string => withoutComments(read(path)).replace(/^\s*\/\/.*$/gm, '')

const OUTPUTS_DIR = 'src/renderer/ui/outputs'
const OUTPUTS_CSS = `${OUTPUTS_DIR}/outputs.css`
const TOKENS_CSS = 'src/renderer/design/tokens.css'

const outputsSources = filesUnder(OUTPUTS_DIR).filter(
  (path) => /\.tsx?$/.test(path) && !/\.test\./.test(path)
)

const RAIL_MAIN = [
  'src/main/fold/rail-rows.ts',
  'src/main/fold/artifact-owner.ts',
  'src/main/projections/rail.ts',
  'src/main/sources/project/watch-artifacts.ts',
  'src/main/rail-bridge.ts'
]
/** The stream's side of the rail (Story 3.6): what the runs say of the rows, and the holder that hands it to the projection. */
const RAIL_STREAM = [
  'src/main/fold/rail-annotations.ts',
  'src/main/projections/rail-annotator.ts',
  'src/main/rail-annotations.ts',
  'src/shared/section-progress.ts'
]
const RAIL_ALL = [...RAIL_MAIN, ...RAIL_STREAM, 'src/shared/rail.ts', ...outputsSources]

const declared = new Set(
  [...withoutComments(read(TOKENS_CSS)).matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name)
)

describe('the outputs stylesheet', () => {
  const css = withoutComments(read(OUTPUTS_CSS))

  it('is governed by the literal guard and holds no colour, dimension, radius or font stack', () => {
    expect(guardedStylesheets()).toContain(OUTPUTS_CSS)
    expect(literalsIn(OUTPUTS_CSS, read(OUTPUTS_CSS))).toEqual([])
  })

  it('names only tokens that tokens.css declares', () => {
    const used = [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name)

    expect(used.length).toBeGreaterThan(0)
    expect(used.filter((name) => !declared.has(name))).toEqual([])
  })

  it('spends the tokens the contract names', () => {
    for (const name of [
      '--rail-row-padding',
      '--rail-annotation-max',
      '--rail-name-min',
      '--file-icon-width',
      '--file-icon-height',
      '--opacity-mark',
      '--space-md-plus',
      '--code-tag-bg',
      '--code-tag-padding',
      '--radius-chip',
      '--amber',
      '--text-strong',
      '--fs-body-ui',
      '--fs-label',
      '--fs-meta'
    ]) {
      expect(css, name).toContain(`var(${name})`)
    }
  })

  it('holds no stacking, outline, keyframes, motion or focus rule, and no shorthand font', () => {
    // Story 1.12 made the row a control, so the pointer cursor and the hover
    // ground are allowed here and nowhere the rail's rows are not.
    expect(css).not.toMatch(/z-index|outline|@keyframes|transition|animation|:focus/)
    expect(css).not.toMatch(/(^|[\s;{])font\s*:/)
  })

  it('keeps the annotation tag to one line that gives way with an ellipsis, at a width from tokens.css alone', () => {
    const rule = css.match(/\.output-row-annotation\s*\{[^}]*\}/)?.[0] ?? ''

    expect(rule).toMatch(/max-width:\s*var\(--rail-annotation-max\)/)
    expect(rule).toMatch(/overflow:\s*hidden/)
    expect(rule).toMatch(/text-overflow:\s*ellipsis/)
    // The row's meta cluster is nowrap, so the tag is one line; the file name keeps its own ellipsis.
    expect(css).toMatch(/\.output-row-meta\s*\{[^}]*white-space:\s*nowrap/)
    expect(css).toMatch(/\.output-row-name\s*\{[^}]*text-overflow:\s*ellipsis/)
    // The tag is what gives way: the meta cluster shrinks and the file name keeps a floor from a token.
    expect(css).toMatch(/\.output-row-meta\s*\{[^}]*flex:\s*0 1 auto;[^}]*min-width:\s*0;/)
    expect(css).toMatch(/\.output-row-name\s*\{[^}]*min-width:\s*var\(--rail-name-min\)/)
    expect(css).not.toMatch(/\.output-row-name\s*\{[^}]*min-width:\s*0/)
    const tokens = withoutComments(read(TOKENS_CSS))
    expect(tokens).toMatch(/--rail-annotation-max:\s*170px;/)
    expect(tokens).toMatch(/--rail-name-min:\s*56px;/)
  })

  it('gives the row button the pointer and the hover ground a persona tile has, and nothing more', () => {
    expect(css).toMatch(/\.output-row-button\s*\{[^}]*cursor:\s*pointer/)
    expect(css).toMatch(/\.output-row-button:hover\s*\{[^}]*background:\s*var\(--panel-2\)/)
    expect([...css.matchAll(/:hover/g)]).toHaveLength(1)
  })
})

describe('the outputs sources', () => {
  const ROW = `${OUTPUTS_DIR}/output-row.tsx`

  it('draw no control, tab stop or handler but in the row, and no role, inline style, title or live region anywhere', () => {
    expect(outputsSources).toContain(ROW)
    for (const path of outputsSources) {
      const text = code(path)
      // The row is the one control (Story 1.12): a native button, its tab stop
      // and its two handlers live in output-row.tsx and nowhere else.
      if (path !== ROW) {
        expect(text, path).not.toMatch(/<button|tabindex=|tabIndex=|onClick|onKeyDown/i)
      }
      expect(text, path).not.toMatch(/<input|role=|style=|title=/)
      expect(text, path).not.toMatch(/aria-live/)
      expect(text, path).not.toMatch(/announc/i)
    }
  })

  it('make the row exactly one native button, reached by Enter as a click and moved by rowMove', () => {
    const row = code(ROW)
    const nav = code(`${OUTPUTS_DIR}/row-nav.ts`)

    expect(row.match(/<button/g)).toHaveLength(1)
    expect(row).toMatch(/<button\s+type="button"/)
    expect(row).toContain('tabIndex={tabStop ? 0 : -1}')
    expect(row).toContain('focus-inset')
    // No key is named in the row: Enter is the native click.
    expect(row).not.toMatch(/\bEnter\b|key ===|\.key\b/)
    expect(nav).toContain('rovingKey')
    expect(nav).toContain("['Enter']")
    expect(nav).not.toMatch(/Arrow|case '/)
  })

  it('never say create, new, edit, save, written by or generated to the user', () => {
    for (const path of outputsSources.filter((p) => p.endsWith('.tsx'))) {
      // Strings and JSX text only: identifiers and type names are not copy.
      const literals = [...code(path).matchAll(/>\s*([^<>{}]+?)\s*</g), ...code(path).matchAll(/'([^']+)'/g)]
        .map(([, text]) => text)
        .join('\n')
      expect(literals, path).not.toMatch(/\b(create|new|edit|save|written by|generated)\b/i)
    }
  })

  it('store no position, stage or answer anywhere', () => {
    for (const path of RAIL_ALL) {
      expect(code(path), path).not.toMatch(/localStorage|sessionStorage|userData|indexedDB/)
    }
  })
})

describe('the rail modules in main', () => {
  it('import no node:fs, name no write API and read no content', () => {
    for (const path of RAIL_ALL) {
      const text = code(path)
      expect(text, path).not.toMatch(/node:fs|from 'fs'|require\(['"]fs/)
      expect(text, path).not.toMatch(
        /\b(writeFile|appendFile|createWriteStream|unlinkSync|rename|mkdir|rmSync|copyFile|truncate)\b/
      )
      expect(text, path).not.toMatch(/\b(readFile|readFileSync|createReadStream|readdir|openSync)\b/)
    }
  })

  it('name sprint-status only in artifact-owner.ts, and parse no YAML', () => {
    for (const path of [...RAIL_ALL, 'src/preload/index.ts']) {
      const text = read(path)
      if (path.endsWith('artifact-owner.ts')) {
        expect(text).toContain('sprint-status.yaml')
      } else {
        expect(text, path).not.toContain('sprint-status')
      }
      expect(text, path).not.toMatch(/from ['"](?:js-)?yaml|\bYAML\b|parseYaml/)
    }
  })

  it('configure the watcher for atomic writes and stats, without a write-finish delay or polling', () => {
    const watcher = code('src/main/sources/project/watch-artifacts.ts')

    expect(watcher).toContain('atomic: true')
    expect(watcher).toContain('alwaysStat: true')
    expect(watcher).toContain('ignoreInitial: false')
    expect(watcher).not.toMatch(/awaitWriteFinish|usePolling|interval:|debounce/)
    // `_bmad` only: no watcher on the skills directory or the harness's own
    // data. The watch path is the project root so that a `_bmad` created after
    // launch is seen, and everything under the root but `_bmad` is ignored.
    expect(watcher).toContain('watch(projectRoot')
    expect(watcher).toContain("WATCHED_DIR = '_bmad'")
    expect(watcher).toContain('!underWatchedDir(path)')
    expect(watcher).not.toMatch(/\.claude|userData/)
  })

  it('leave the install watcher’s trigger-not-reader contract untouched by naming it nowhere', () => {
    for (const path of RAIL_MAIN) {
      expect(code(path), path).not.toContain('watch-install')
    }
  })

  it('adds no dependency', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> }

    expect(Object.keys(pkg.dependencies).sort()).toEqual(['chokidar', 'dompurify', 'markdown-it'])
  })

  it('has no merged status field anywhere in the contract', () => {
    const contract = code('src/shared/rail.ts')

    expect(contract).not.toMatch(/\bstatus\b/)
    expect(contract).toContain('annotation?: RailAnnotation')
  })

  it('keeps the stream’s side to the one seam: it tells `annotate` and names no disk field, observation, settle or row', () => {
    const fold = code('src/main/fold/rail-annotations.ts')
    const annotator = code('src/main/projections/rail-annotator.ts')
    const holder = code('src/main/rail-annotations.ts')

    for (const [path, text] of [
      ['src/main/fold/rail-annotations.ts', fold],
      ['src/main/projections/rail-annotator.ts', annotator],
      ['src/main/rail-annotations.ts', holder]
    ]) {
      // No disk word, no way to make, remove or settle a row.
      expect(text, path).not.toMatch(/\b(?:savedAt|observedAt|mtimeMs|nextSettleAt|settle|observe|toRows|RailRow|RailSnapshot|RailTable|createRailProjection|artifact:\w+)\b|\bstate\s*:/)
    }
    // The producer reaches the projection through `annotate` alone.
    const methods = [...annotator.matchAll(/\btarget\??\.(\w+)\(/g)].map(([, method]) => method)
    expect(methods.length).toBeGreaterThan(0)
    expect(new Set(methods)).toEqual(new Set(['annotate']))
    expect(annotator).toMatch(/annotate\(path: string, annotation: RailAnnotation \| null\): void/)
    // The projection's own surface is as it was: `annotate` stays the stream's one way in.
    const projection = code('src/main/projections/rail.ts')
    expect(projection).toMatch(/annotate\(path: string, annotation: RailAnnotation \| null\): void/)
    expect(projection).not.toMatch(/owner:\s*annotation|annotation\??\.owner/)
  })

  it('carries the stream’s owner in the annotation and leaves the row’s own owner the class’s', () => {
    const contract = code('src/shared/rail.ts')

    // `owner` is the single run's; `owners` is contention's (Story 3.9), present only on that annotation and then in place of `owner`.
    expect(contract).toContain('export type RailAnnotation = { text: string; owner?: RailOwner; owners?: readonly RailOwner[] }')
    expect(contract).toMatch(/owner\?: RailOwner\n\s*annotation\?: RailAnnotation/)
    // The watcher side and the persona fold read the row's `owner` and disk fields, never the annotation.
    expect(code('src/main/fold/persona-state.ts')).not.toMatch(/annotation/)
    expect(code('src/main/fold/artifact-owner.ts')).not.toMatch(/annotation/)
    // The projection attaches the class's owner from the path alone.
    expect(code('src/main/projections/rail.ts')).toContain('ownerAgentIdFor(row.path)')
  })

  it('computes no annotation in the renderer: the outputs draw what the row carries and name no event, fold or section reader', () => {
    for (const path of outputsSources) {
      expect(code(path), path).not.toMatch(/sectionProgress|progressLabel|section-progress|rail-annotat|doc:prose|doc:committed|run:|ContractEvent/)
    }
    // The one row component is untouched by it: it draws `annotation.text` and is handed the owner's name.
    expect(code(`${OUTPUTS_DIR}/output-row.tsx`)).not.toMatch(/annotation\??\.owner|agentId/)
    // The owner slot's words are chosen in one pure function: the annotation's owner, else the class's, and a contended row's owners.
    expect(code(`${OUTPUTS_DIR}/outputs.tsx`)).toContain('ownerName={ownerLabel(row, nameOf)}')
    expect(code(`${OUTPUTS_DIR}/owner-label.ts`)).toContain('row.annotation?.owner?.agentId ?? row.owner?.agentId')
    expect(code(`${OUTPUTS_DIR}/owner-label.ts`)).toContain('row.annotation?.owners')
  })

  it('adds no channel, command, event or preload method for it', () => {
    for (const path of ['src/preload/index.ts', 'src/shared/events.ts', 'src/shared/commands.ts', 'src/shared/channels.ts']) {
      expect(code(path), path).not.toMatch(/annotat/i)
    }
  })

  it('writes the disk state and the annotation from separate functions, neither naming the other’s field', () => {
    const fold = code('src/main/fold/rail-rows.ts')
    const between = (from: string, to: string): string =>
      fold.slice(fold.indexOf(from), fold.indexOf(to))

    const annotateBody = between('export function annotate', 'export function nextSettleAt')
    const settleBody = between('export function settle', 'export function annotate')

    expect(settleBody).not.toMatch(/annotation\s*[:=]/)
    expect(annotateBody).not.toMatch(/observedAt|savedAt|mtimeMs|state\s*:/)
  })
})

describe('the rail in the window', () => {
  it('registers the rail bridge beside the install bridge', () => {
    const index = read('src/main/index.ts')

    // Story 3.1: the rail bridge takes the session side's memlog observer, so it
    // is registered after the session bridge and is handed that one dependency.
    expect(index).toContain('registerRailBridge({')
    expect(index.indexOf('registerInstallBridge()')).toBeLessThan(index.indexOf('registerRailBridge({'))
  })

  it('feeds the shell from useRail and mounts the conversation as the thread', () => {
    const app = read('src/renderer/ui/app.tsx')

    expect(app).toContain('useRail()')
    expect(app).toMatch(/<Shell[^>]*rail=\{rail\}[^>]*railFailure=\{railFailure\}[\s\S]*?<Turns entries=/)
    expect(app).not.toContain('PREVIEW_NOTES')
  })
})
