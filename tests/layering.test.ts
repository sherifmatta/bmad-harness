import { readFileSync } from 'node:fs'
import { posix, resolve } from 'node:path'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'
import { LAYER_GRAPH } from '../eslint.config.mjs'

/**
 * The layer rule is an error, not a convention — so it is asserted by a test
 * that runs the project's own ESLint configuration over every pair the
 * configuration generates, rather than over a hand-picked two.
 *
 * Every probe is linted at a path inside the layer it belongs to; the file
 * never exists on disk, so no violation is ever committed in order to prove one
 * is caught.
 */

let eslint: ESLint

beforeAll(() => {
  eslint = new ESLint()
})

/** Both rules that carry the layer guard: static imports and dynamic ones. */
const GUARD_RULES = new Set(['no-restricted-imports', 'no-restricted-syntax'])

async function violationsAt(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((message) => GUARD_RULES.has(String(message.ruleId)))
}

/**
 * The five ways one layer can be spelled from inside another. Each returns the
 * source text of a probe that reaches `forbidden` from a file at `fromDir`.
 */
const SPELLINGS = [
  {
    name: 'sibling-relative',
    nesting: '',
    code: (specifier: string) => `import '${specifier}'`
  },
  {
    name: 'deep-relative',
    nesting: 'a/b/c',
    code: (specifier: string) => `import '${specifier}'`
  },
  {
    name: 'root-qualified',
    nesting: '',
    absolute: true,
    code: (specifier: string) => `import '${specifier}'`
  },
  {
    name: 'aliased',
    nesting: '',
    absolute: true,
    alias: '@app/',
    code: (specifier: string) => `import '${specifier}'`
  },
  {
    name: 'dynamic import()',
    nesting: '',
    code: (specifier: string) => `export const reach = async () => import('${specifier}')`
  }
] as const

describe('the layer rule', () => {
  it('governs every directory that holds source, leaving none unconstrained', () => {
    // The two process floors are what make this total: a directory nobody
    // thought to name inherits its process's rule instead of escaping.
    expect(LAYER_GRAPH.map((layer) => layer.dir).sort()).toEqual([
      'src/main',
      'src/main/fold',
      'src/main/projections',
      'src/main/sources',
      'src/main/windows',
      'src/preload',
      'src/renderer',
      'src/renderer/design',
      'src/renderer/ui',
      'src/shared'
    ])
  })

  it('is the dependency graph the architecture names, and no looser', () => {
    // Shrinking a forbidden list also shrinks the generated table above, so the
    // graph is asserted outright: loosening it is a visible decision, not a
    // silent loss of coverage.
    expect(
      Object.fromEntries(LAYER_GRAPH.map((layer) => [layer.name, [...layer.forbidden].sort()]))
    ).toEqual({
      'Main process': ['src/preload', 'src/renderer'],
      'Renderer process': ['src/main', 'src/preload'],
      View: ['src/main', 'src/preload'],
      Design: ['src/main', 'src/preload', 'src/renderer/ui'],
      Bridge: ['src/main', 'src/preload', 'src/renderer'],
      Projections: ['src/main/windows', 'src/preload', 'src/renderer'],
      Fold: [
        'src/main/projections',
        'src/main/sources',
        'src/main/windows',
        'src/preload',
        'src/renderer'
      ],
      Sources: [
        'src/main/fold',
        'src/main/projections',
        'src/main/windows',
        'src/preload',
        'src/renderer'
      ],
      Windows: ['src/preload', 'src/renderer'],
      Preload: ['src/main', 'src/renderer']
    })
  })

  // The spec's I/O matrix names these two rows directly, so they are asserted
  // by name as well as by the generated table above.
  it.each([
    {
      row: 'a renderer/ui file reaching into sources, fold or projections',
      filePath: 'src/renderer/ui/probe.ts',
      code: [
        "import '../../main/sources/watch-project'",
        "import '../../main/fold/elapsed'",
        "import '../../main/projections/rail'"
      ].join('\n'),
      expected: 3
    },
    {
      row: 'a fold file reaching sideways into sources',
      filePath: 'src/main/fold/probe.ts',
      code: "import '../sources/watch-project'",
      expected: 1
    }
  ])('fails $row', async ({ filePath, code, expected }) => {
    const violations = await violationsAt(filePath, code)

    expect(violations).toHaveLength(expected)
    expect(violations.every((message) => message.severity === 2)).toBe(true)
  })

  describe.each(LAYER_GRAPH)('$name', ({ dir, forbidden }) => {
    it.each(
      forbidden.flatMap((target: string) =>
        SPELLINGS.map((spelling) => {
          const fromDir = spelling.nesting ? posix.join(dir, spelling.nesting) : dir
          const specifier =
            'absolute' in spelling && spelling.absolute
              ? `${'alias' in spelling ? spelling.alias : ''}${target}/probe`
              : `${posix.relative(fromDir, target)}/probe`

          return {
            target,
            spelling: spelling.name,
            filePath: posix.join(fromDir, 'probe.ts'),
            code: spelling.code(specifier),
            specifier
          }
        })
      )
    )('fails reaching $target as $spelling ($specifier)', async ({ filePath, code }) => {
      const violations = await violationsAt(filePath, code)

      expect(violations).toHaveLength(1)
      // Never a warning: severity 2 is the difference between failing the build
      // and printing something nobody reads.
      expect(violations[0].severity).toBe(2)
    })

    it('permits a package import and a sibling module', async () => {
      const violations = await violationsAt(
        posix.join(dir, 'probe.ts'),
        ["import 'markdown-it'", "import './sibling'"].join('\n')
      )

      expect(violations).toHaveLength(0)
    })
  })
})

describe('what the layer rule deliberately permits', () => {
  it.each([
    {
      what: 'View reaching down into Design and Bridge',
      filePath: 'src/renderer/ui/probe.ts',
      code: ["import '../design/tokens'", "import '../../shared/contract'"].join('\n')
    },
    {
      what: 'Projections reaching down into Fold and Sources',
      filePath: 'src/main/projections/probe.ts',
      code: ["import '../fold/elapsed'", "import '../sources/watch-project'"].join('\n')
    },
    {
      what: 'the per-window holder reaching Projections and the bridges reaching the holder',
      filePath: 'src/main/probe.ts',
      code: ["import './projections/personas'", "import './persona-states'"].join('\n')
    },
    {
      what: 'the persona-state projection reaching its fold and nothing above it',
      filePath: 'src/main/projections/probe.ts',
      code: ["import '../fold/persona-state'", "import '../../shared/events'"].join('\n')
    },
    {
      what: 'the transcript projection reaching its fold and the persistence source, and the fold reaching only the contract',
      filePath: 'src/main/projections/probe.ts',
      code: [
        "import '../fold/transcript'",
        "import '../sources/persistence/transcript-file'",
        "import '../../shared/conversation'"
      ].join('\n')
    },
    {
      what: 'the persistence source reaching only the contract it stores',
      filePath: 'src/main/sources/persistence/probe.ts',
      code: "import '../../../shared/conversation'"
    },
    {
      what: 'the composition root wiring the main side together',
      filePath: 'src/main/probe.ts',
      code: [
        "import './windows/main-window'",
        "import './sources/watch-project'",
        "import './fold/elapsed'",
        "import './projections/rail'"
      ].join('\n')
    },
    {
      what: 'the macOS shell reaching the main side it wires up',
      filePath: 'src/main/windows/probe.ts',
      code: ["import '../sources/watch-project'", "import '../../shared/contract'"].join('\n')
    }
  ])('permits $what', async ({ filePath, code }) => {
    expect(await violationsAt(filePath, code)).toHaveLength(0)
  })
})

describe('the permission policy', () => {
  const POLICY = 'src/main/fold/permission-policy.ts'
  const source = readFileSync(resolve(import.meta.dirname, '..', POLICY), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('is pure: path arithmetic only, with the file system, the home directory and the clock handed in', () => {
    const imports = [...source.matchAll(/^import\b[^;]*?from\s+'([^']+)'/gm)].map(([, from]) => from)

    expect(imports).toEqual(['node:path'])
    expect(source).not.toMatch(/\bprocess\.|\brequire\(|\bimport\(|electron|node:fs|node:os|homedir|realpath/)
    expect(source).not.toMatch(/Date\.now|new Date\(|Math\.random|performance\.now|setTimeout|setInterval/)
  })

  it('is reached by the registry, which composes it, and by no Source', async () => {
    expect(await violationsAt('src/main/probe.ts', "import './fold/permission-policy'")).toHaveLength(0)
    expect(await violationsAt('src/main/sources/session/probe.ts', "import '../../fold/permission-policy'")).toHaveLength(1)
  })
})
