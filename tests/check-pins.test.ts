import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * The one tool in the repository whose failure mode is silence had no test of
 * its own: `npm run lint` runs `scripts/check-pins.mjs`, and until now nothing
 * asserted that it actually exits non-zero on drift, or that it says anything
 * useful when the lockfile it reads is missing rather than merely wrong.
 *
 * Each case runs the real script against a fixture root. The script resolves
 * its repository root as `dirname(import.meta.url)/..`, so copying it into
 * `<fixture>/scripts/` makes `<fixture>` the root it inspects — no flags, no
 * seams, and no mocking of the thing under test.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SCRIPT = join(ROOT, 'scripts/check-pins.mjs')

const fixtures: string[] = []

afterEach(() => {
  for (const path of fixtures.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

type Run = { status: number; output: string }

/** Run the real script against a fixture root, capturing status and output. */
function runAgainst(files: Record<string, unknown | undefined>): Run {
  const fixture = mkdtempSync(join(tmpdir(), 'check-pins-'))
  fixtures.push(fixture)
  mkdirSync(join(fixture, 'scripts'))
  cpSync(SCRIPT, join(fixture, 'scripts/check-pins.mjs'))

  for (const [name, contents] of Object.entries(files)) {
    if (contents === undefined) {
      continue
    }
    writeFileSync(
      join(fixture, name),
      typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
    )
  }

  try {
    const stdout = execFileSync(process.execPath, [join(fixture, 'scripts/check-pins.mjs')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return { status: 0, output: stdout }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string }
    return { status: failure.status ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` }
  }
}

/** The real manifests, so a fixture starts from a set that genuinely passes. */
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}
const lockfile = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { version: string }>
}

describe('the pin check', () => {
  it('passes the repository as it stands, printing nothing', () => {
    expect(runAgainst({ 'package.json': packageJson, 'package-lock.json': lockfile })).toEqual({
      status: 0,
      output: ''
    })
  })

  it('fails when package.json declares a version other than the pin', () => {
    const drifted = structuredClone(packageJson)
    drifted.devDependencies.electron = '45.0.0'

    const run = runAgainst({ 'package.json': drifted, 'package-lock.json': lockfile })

    expect(run.status).toBe(1)
    expect(run.output).toContain('electron')
    expect(run.output).toContain('45.0.0')
  })

  it('fails when package.json declares a range rather than an exact version', () => {
    const drifted = structuredClone(packageJson)
    drifted.devDependencies.vitest = '^5.0.1'

    const run = runAgainst({ 'package.json': drifted, 'package-lock.json': lockfile })

    expect(run.status).toBe(1)
    expect(run.output).toContain('not an exact version')
  })

  it('fails when the lockfile resolves something other than the pin', () => {
    const drifted = structuredClone(lockfile)
    drifted.packages['node_modules/chokidar'] = { version: '5.0.0' }

    const run = runAgainst({ 'package.json': packageJson, 'package-lock.json': drifted })

    expect(run.status).toBe(1)
    expect(run.output).toContain('chokidar')
  })

  it('names a missing lockfile instead of throwing a stack trace at the reader', () => {
    // The failure mode this tool exists to prevent is silence; a raw ENOENT
    // trace is the same thing wearing a longer coat.
    const run = runAgainst({ 'package.json': packageJson })

    expect(run.status).toBe(1)
    expect(run.output).toContain('package-lock.json')
    expect(run.output).not.toContain('at readFileSync')
  })

  it('names an unreadable manifest instead of throwing a parse trace', () => {
    const run = runAgainst({ 'package.json': packageJson, 'package-lock.json': '{ not json' })

    expect(run.status).toBe(1)
    expect(run.output).toContain('package-lock.json')
    expect(run.output).not.toMatch(/SyntaxError|JSON\.parse/)
  })

  it('names a lockfile too old to carry a packages map', () => {
    // lockfileVersion 1 has `dependencies`, not `packages`. Every pin would
    // read as "absent", which reports drift that is not there.
    const run = runAgainst({
      'package.json': packageJson,
      'package-lock.json': { lockfileVersion: 1, dependencies: {} }
    })

    expect(run.status).toBe(1)
    expect(run.output).toMatch(/lockfileVersion|packages/)
  })
})
