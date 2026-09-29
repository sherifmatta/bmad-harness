import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createInstallProjection } from '../src/main/projections/install'
import { createInstallSource } from '../src/main/sources/install/resolvers'
import type { CommandResult, CommandRunner } from '../src/main/sources/install/run-command'
import type { InstallSnapshot } from '../src/shared/install'

/**
 * The live check, and the only one that proves the transcription: the real
 * install source is run against this repository and compared with an
 * independent invocation of the same resolvers made here. Everything else in
 * the install suite restates a shape; this one reads it.
 *
 * `uv` is a stated prerequisite of the product, so there is no skip.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')
const MENU_AGENTS = ['bmad-agent-analyst', 'bmad-agent-pm']
const SIX = ['module', 'team', 'name', 'title', 'icon', 'description'] as const

/** The test's own invocation of a resolver — deliberately not the source's code path. */
function resolver(script: string, args: string[]): Record<string, unknown> {
  const out = execFileSync(
    'uv',
    ['run', '--no-project', '--quiet', join(ROOT, '_bmad/scripts', script), ...args],
    {
      cwd: tmpdir(),
      encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
    }
  )
  return JSON.parse(out) as Record<string, unknown>
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
}

type Raw = { code: string; description: string; skill?: string; prompt?: string }

const rawRoster = resolver('resolve_config.py', ['--project-root', ROOT, '--key', 'agents'])
  .agents as Record<string, Record<string, string>>

function rawMenu(id: string): Raw[] {
  return resolver('resolve_customization.py', [
    '--skill',
    join(ROOT, '.claude/skills', id),
    '--project-root',
    ROOT,
    '--key',
    'agent.menu'
  ])['agent.menu'] as Raw[]
}

describe('the live install', () => {
  const statusBefore = git('status', '--porcelain')

  it('reads the same team, in the same order, with all six fields', async () => {
    const roster = await createInstallSource({ projectRoot: ROOT }).resolveRoster()

    expect(roster.ok).toBe(true)
    if (!roster.ok) {
      return
    }
    const expected = Object.entries(rawRoster).map(([id, fields]) => ({
      id,
      ...Object.fromEntries(SIX.map((key) => [key, fields[key]]))
    }))
    expect(expected.length).toBeGreaterThan(0)
    expect(roster.agents).toEqual(expected)
  })

  it.each(MENU_AGENTS)('reads the same menu for %s, with the skill/prompt split intact', async (id) => {
    const source = createInstallSource({ projectRoot: ROOT })
    const menu = await source.resolveMenu(id)

    expect(menu.ok).toBe(true)
    if (!menu.ok) {
      return
    }
    expect(menu.problems).toEqual([])
    expect(menu.entries).toEqual(
      rawMenu(id).map((entry) => ({
        code: entry.code,
        description: entry.description,
        action:
          entry.skill !== undefined
            ? { kind: 'skill', skill: entry.skill }
            : { kind: 'prompt', prompt: entry.prompt }
      }))
    )
  })

  it("holds the analyst's acceptance cases literally", async () => {
    const menu = await createInstallSource({ projectRoot: ROOT }).resolveMenu('bmad-agent-analyst')

    expect(menu.ok).toBe(true)
    if (menu.ok) {
      const kinds = Object.fromEntries(menu.entries.map((e) => [e.code, e.action.kind]))
      expect(kinds.BP).toBe('skill')
      expect(kinds.MR).toBe('prompt')
    }
  })

  it('serialises a snapshot with no toml, no skill or prompt key, and no skill name', async () => {
    const emitted: InstallSnapshot[] = []
    const projection = createInstallProjection({
      source: createInstallSource({ projectRoot: ROOT }),
      onChange: (snapshot) => emitted.push(snapshot)
    })
    await projection.refresh()

    const text = JSON.stringify([projection.snapshot(), ...emitted])
    expect(projection.snapshot().agents.map((a) => a.id)).toEqual(Object.keys(rawRoster))
    expect(text).not.toContain('.toml')
    expect(text).not.toMatch(/"skill"|"prompt"/)
    const skillNames = MENU_AGENTS.flatMap((id) => rawMenu(id).flatMap((e) => e.skill ?? []))
    expect(skillNames.length).toBeGreaterThan(0)
    for (const name of skillNames) {
      expect(text, name).not.toContain(name)
    }
    // And the analyst's menu did arrive, code and description only.
    expect(projection.snapshot().menus['bmad-agent-analyst']).toHaveLength(
      rawMenu('bmad-agent-analyst').length
    )
  })

  it('writes nothing into the project', () => {
    expect(existsSync(join(ROOT, '_bmad/scripts/__pycache__'))).toBe(false)
    for (const id of MENU_AGENTS) {
      expect(existsSync(join(ROOT, '.claude/skills', id, '__pycache__')), id).toBe(false)
    }
    expect(git('status', '--porcelain')).toBe(statusBefore)
  })
})

// ---------------------------------------------------------------------------
// The source-text guards.
// ---------------------------------------------------------------------------

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

/** Shipping code only: tests name files to prove things about them. */
const shipping = filesUnder(SRC).filter(
  (path) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path)
)

function withoutCommentText(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const code = (path: string): string => withoutCommentText(readFileSync(path, 'utf8'))
const rel = (path: string): string => relative(ROOT, path)

describe('the install sources of truth', () => {
  it('never both imports the filesystem and names a toml file', () => {
    const offenders = shipping.filter((path) => {
      const text = code(path)
      return /from '(?:node:)?fs(?:\/promises)?'/.test(text) && /\.toml/.test(text)
    })

    expect(offenders.map(rel)).toEqual([])
  })

  it('names toml files as code nowhere in src/main but the watcher', () => {
    const naming = shipping
      .filter((path) => path.startsWith(join(SRC, 'main')) && /\.toml/.test(code(path)))
      .map(rel)

    expect(naming).toEqual(['src/main/sources/install/watch-install.ts'])
  })

  it('finds agents without listing a directory', () => {
    const offenders = filesUnder(join(SRC, 'main/sources/install')).filter((path) =>
      /glob|readdir/.test(readFileSync(path, 'utf8'))
    )

    expect(offenders.map(rel)).toEqual([])
  })

  it('composes no user-facing message that names a path or a toml file', () => {
    const projection = code(join(SRC, 'main/projections/install.ts')).replace(
      /from '[^']*'/g,
      ''
    )
    const strings = [...projection.matchAll(/(['`])((?:\\.|(?!\1).)*)\1/g)].map(([, , text]) => text)

    expect(strings.length).toBeGreaterThan(0)
    // Codes (`resolver/timeout`) carry a slash by design; a message is a phrase.
    const phrases = strings.filter((text) => text.includes(' '))
    expect(phrases.length).toBeGreaterThan(0)
    for (const text of phrases) {
      expect(text, text).not.toMatch(/\.toml|\//)
    }
  })
})

describe('every failure class, end to end through the projection', () => {
  const stderrPath = '/Users/someone/project/_bmad/config.toml'
  const results: [string, CommandResult][] = [
    ['non-zero exit', { ok: false, kind: 'exit', code: 1 }],
    ['signal', { ok: false, kind: 'exit', signal: 'SIGTERM' }],
    ['spawn failure', { ok: false, kind: 'spawn', errno: 'ENOENT' }],
    ['output too large', { ok: false, kind: 'output-too-large' }],
    ['timeout', { ok: false, kind: 'timeout' }],
    ['not json', { ok: true, stdout: 'garbage' }],
    ['wrong shape', { ok: true, stdout: JSON.stringify({ agents: [] }) }],
    ['unsafe id', { ok: true, stdout: JSON.stringify({ agents: { '../../x': {} } }) }]
  ]

  it.each(results)('%s yields a lower-case message and a detail without a path', async (_name, result) => {
    const run: CommandRunner = async () => result
    const projection = createInstallProjection({
      source: createInstallSource({ projectRoot: '/somewhere', run }),
      onChange: () => {}
    })
    await projection.refresh()

    const { errors, agents } = projection.snapshot()
    expect(errors).toHaveLength(1)
    expect(agents).toEqual([])
    for (const error of errors) {
      expect(error.message).toBe(error.message.toLowerCase())
      expect(error.message).not.toMatch(/[.!?:;,]$/)
      expect(error.message).toContain(' · ')
      expect(error.detail ?? '').not.toContain('/')
      expect(JSON.stringify(error)).not.toContain(stderrPath)
      expect(JSON.stringify(error)).not.toContain('.toml')
    }
  })

  it('names a failed menu in the same register', async () => {
    const agent = {
      mary: {
        module: 'bmm',
        name: 'mary',
        title: 'analyst',
        icon: 'i',
        description: 'd'
      }
    }
    const run: CommandRunner = async (_command, args) =>
      args.some((arg) => arg.endsWith('resolve_config.py'))
        ? { ok: true, stdout: JSON.stringify({ agents: agent }) }
        : { ok: false, kind: 'exit', code: 1 }
    const projection = createInstallProjection({
      source: createInstallSource({ projectRoot: '/somewhere', run }),
      onChange: () => {}
    })
    await projection.refresh()

    const [error] = projection.snapshot().errors
    expect(error.code).toBe('resolver/invocation-failed')
    expect(error.message).toBe('menu · mary · resolver failed')
    expect(error.detail).not.toContain('/')
  })
})

describe('the stylesheet of the error line', () => {
  it('defines every class the component renders', () => {
    const tsx = readFileSync(join(SRC, 'renderer/ui/install/error-line.tsx'), 'utf8')
    const css = readFileSync(join(SRC, 'renderer/ui/install/error-line.css'), 'utf8')
    const used = [...tsx.matchAll(/className="([^"]+)"/g)].flatMap(([, names]) => names.split(' '))

    expect(used.length).toBeGreaterThan(0)
    for (const name of used) {
      expect(css, name).toContain(`.${name}`)
    }
  })
})
