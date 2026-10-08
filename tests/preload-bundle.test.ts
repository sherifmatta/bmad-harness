import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { build } from 'vite'
import type { Rollup } from 'vite'

import { inlineSharedIntoEachPreload } from '../electron.vite.inline-shared'

/**
 * A sandboxed preload loads no second file. All three preloads draw on `src/shared/`,
 * and a module two entries share is built as a chunk that one `require`s from the
 * other, so the build gives each entry its own copy. This builds the three preload
 * entries for real, in memory, with the plugin the config uses.
 */

const ROOT = resolve(import.meta.dirname, '..')

type Output = Rollup.OutputChunk | Rollup.OutputAsset

async function bundle(input: Record<string, string>, root = ROOT, withPlugin = true): Promise<Output[]> {
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: withPlugin ? [inlineSharedIntoEachPreload()] : [],
    build: {
      write: false,
      minify: false,
      target: 'node22',
      rollupOptions: { input, external: ['electron'], output: { format: 'cjs', entryFileNames: '[name].js' } }
    }
  })
  const outputs = Array.isArray(result) ? result : [result]
  return outputs.flatMap((one) => ('output' in one ? one.output : []))
}

/** The ways one built file can reach another. */
const RELATIVE = /require\(\s*["']\.{1,2}\/|from\s*["']\.{1,2}\/|import\(\s*["']\.{1,2}\/|import\s+["']\.{1,2}\//

describe('the three preload entries, built', () => {
  it('are exactly three files, each with no relative require or import, and each with the channels it speaks', async () => {
    const output = await bundle({
      index: join(ROOT, 'src/preload/index.ts'),
      doc: join(ROOT, 'src/preload/doc.ts'),
      welcome: join(ROOT, 'src/preload/welcome.ts')
    })
    const chunks = output.filter((file): file is Rollup.OutputChunk => file.type === 'chunk')

    expect(chunks.map((chunk) => chunk.fileName).sort()).toEqual(['doc.js', 'index.js', 'welcome.js'])
    for (const chunk of chunks) {
      expect(chunk.code, chunk.fileName).not.toMatch(RELATIVE)
    }
    const code = (name: string): string => chunks.find((chunk) => chunk.fileName === name)?.code ?? ''
    for (const channel of ['project:path', 'install:get', 'session:open', 'session:event', 'conversation:end', 'doc:open']) {
      expect(code('index.js'), channel).toContain(`"${channel}"`)
    }
    for (const channel of ['doc:get', 'doc:changed', 'doc:reveal', 'doc:open-in-editor', 'doc:close']) {
      expect(code('doc.js'), channel).toContain(`"${channel}"`)
    }
    for (const channel of ['welcome:recent', 'welcome:choose', 'welcome:open-recent', 'welcome:open-dropped']) {
      expect(code('welcome.js'), channel).toContain(`"${channel}"`)
    }
    // Each bundle holds its own channels and none of another window's.
    expect(code('welcome.js')).not.toMatch(/"(?:doc|project|install|rail|session):/)
    expect(code('doc.js')).not.toContain('"welcome:')
    expect(code('index.js')).not.toContain('"welcome:')
  })

  it('would be a chunk one requires from the other without the plugin: the check can fail', async () => {
    const output = await bundle(
      {
        index: join(ROOT, 'src/preload/index.ts'),
        doc: join(ROOT, 'src/preload/doc.ts'),
        welcome: join(ROOT, 'src/preload/welcome.ts')
      },
      ROOT,
      false
    )

    expect(output.filter((file) => file.type === 'chunk').length).toBeGreaterThan(3)
  })
})

describe('a shared module that imports another shared module', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'harness-preload-bundle-'))
  afterAll(() => rmSync(temporary, { recursive: true, force: true }))

  it('is inlined with what it imports: no chunk for the nested import either', async () => {
    mkdirSync(join(temporary, 'src/shared'), { recursive: true })
    mkdirSync(join(temporary, 'src/preload'), { recursive: true })
    writeFileSync(join(temporary, 'src/shared/inner.ts'), "export const INNER = 'inner:value'\n")
    writeFileSync(
      join(temporary, 'src/shared/outer.ts'),
      "import { INNER } from './inner'\nexport const OUTER = `outer:${INNER}`\n"
    )
    for (const entry of ['a', 'b']) {
      writeFileSync(
        join(temporary, `src/preload/${entry}.ts`),
        `import { OUTER } from '../shared/outer'\nconsole.log('${entry}', OUTER)\n`
      )
    }

    const output = await bundle(
      { a: join(temporary, 'src/preload/a.ts'), b: join(temporary, 'src/preload/b.ts') },
      temporary
    )
    const chunks = output.filter((file): file is Rollup.OutputChunk => file.type === 'chunk')

    expect(chunks.map((chunk) => chunk.fileName).sort()).toEqual(['a.js', 'b.js'])
    for (const chunk of chunks) {
      expect(chunk.code, chunk.fileName).not.toMatch(RELATIVE)
      expect(chunk.code, chunk.fileName).toContain('inner:value')
    }
  })
})
