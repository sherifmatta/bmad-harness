import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createInstallSource } from '../src/main/sources/install/resolvers'
import { createPrerequisiteChecks } from '../src/main/sources/preflight/tools'

/**
 * The live check, and the only one that proves the argument vectors against
 * the real tools. Nothing here depends on being signed in: `uv` is a stated
 * prerequisite of the product, so there is no skip for it, and the `claude`
 * checks are aimed at an empty `PATH` or a config directory with no login.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

const emptyDir = (): string => mkdtempSync(join(tmpdir(), 'preflight-'))

function claudeInstalled(): boolean {
  try {
    execFileSync('claude', ['--version'], { stdio: 'ignore', timeout: 15_000 })
    return true
  } catch {
    return false
  }
}

/** This machine's environment with every way of being signed in taken out. */
function withoutLogin(configDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CONFIG_DIR: configDir }
  for (const key of [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY'
  ]) {
    delete env[key]
  }
  return env
}

describe('the real tools', () => {
  it('finds uv on this machine with a Python the resolvers can run under', async () => {
    expect(await createPrerequisiteChecks().checkUv()).toEqual({ ok: true })
  })

  it('names a missing claude when the path holds nothing', async () => {
    const result = await createPrerequisiteChecks({ env: { PATH: emptyDir() } }).checkClaude()

    expect(result).toMatchObject({ ok: false, kind: 'claude-missing' })
  })

  it('names a missing uv when the path holds nothing', async () => {
    const result = await createPrerequisiteChecks({ env: { PATH: emptyDir() } }).checkUv()

    expect(result).toMatchObject({ ok: false, kind: 'uv-missing' })
  })

  it.skipIf(!claudeInstalled())('names a signed-out claude for a config directory with no login', async () => {
    const result = await createPrerequisiteChecks({
      env: withoutLogin(emptyDir())
    }).checkClaude()

    expect(result).toMatchObject({ ok: false, kind: 'claude-unauthenticated' })
    expect(JSON.stringify(result)).not.toMatch(/@|\/Users|\.claude/)
  })

  it('names a Python below 3.11 through the real spawn path', async () => {
    const bin = emptyDir()
    const shim = join(bin, 'uv')
    writeFileSync(
      shim,
      [
        '#!/bin/sh',
        'for arg in "$@"; do',
        '  if [ "$arg" = ">=3.11" ]; then exit 2; fi',
        'done',
        'echo 3.9.6',
        ''
      ].join('\n')
    )
    chmodSync(shim, 0o755)

    const result = await createPrerequisiteChecks({ env: { PATH: bin } }).checkUv()

    expect(result).toMatchObject({ ok: false, kind: 'uv-python-old', detail: 'python 3.9.6' })
  })
})

describe('a directory with no bmad install', () => {
  it('resolves no agents through the real existence check, with nothing injected', async () => {
    const source = createInstallSource({ projectRoot: emptyDir() })

    expect(await source.resolveRoster()).toEqual({ ok: true, agents: [] })
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

const shipping = filesUnder(SRC).filter(
  (path) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.endsWith('.d.ts')
)

function withoutCommentText(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const code = (path: string): string => withoutCommentText(readFileSync(path, 'utf8'))
const rel = (path: string): string => relative(ROOT, path)

describe('what preflight never does', () => {
  it('reads no Claude credential or settings file anywhere in src', () => {
    const offenders = shipping.filter((path) => /\.claude\/|settings\.json|credentials/i.test(code(path)))

    expect(offenders.map(rel)).toEqual([])
  })

  it('never starts a session, prints, runs, installs or downloads', () => {
    const preflight = shipping.filter((path) => path.startsWith(join(SRC, 'main/sources/preflight')))
    expect(preflight.length).toBeGreaterThan(0)

    for (const path of preflight) {
      const text = code(path)
      expect(text, rel(path)).not.toMatch(/--print|uv run|'-p'|'run'|'pip'|'install'/)
    }
  })

  it('builds the real checks by default and hands them to the projection', () => {
    const bridge = code(join(SRC, 'main/install-bridge.ts'))

    expect(bridge).toMatch(/createChecks[^\n]*createPrerequisiteChecks\(/)
    expect(bridge).toMatch(/createInstallProjection\(\{[\s\S]*?checks: createChecks\(\)/)
  })

  it('leaves the bridge with exactly its fourteen methods (getBranch arrived in Story 1.9, the two rail methods in Story 1.11, the two document methods in Story 1.12, the three session methods in Story 2.4, getConversation in Story 2.7, endConversation in Story 2.8, closeSession in Story 2.11)', () => {
    const api = readFileSync(join(SRC, 'preload/harness-api.d.ts'), 'utf8')
    const body = api.match(/interface HarnessApi \{([\s\S]*?)\n\}/)

    expect(body, 'HarnessApi must be declared').not.toBeNull()
    const methods = [...body![1].matchAll(/^\s+(\w+)\s*\(/gm)].map(([, name]) => name)
    expect(methods.sort()).toEqual([
      'closeSession',
      'endConversation',
      'getBranch',
      'getConversation',
      'getInstall',
      'getProjectPath',
      'getRail',
      'onDocClosed',
      'onInstallChanged',
      'onRailChanged',
      'onSessionEvent',
      'openDoc',
      'openSession',
      'sendTurn'
    ])
  })

  it('keeps every preflight message lower case, unpunctuated and path-free', () => {
    const projection = code(join(SRC, 'main/projections/install.ts'))
    const messages = [...projection.matchAll(/'((?:claude|uv|no agents) · [^']*)'/g)].map(([, text]) => text)

    expect(messages.length).toBeGreaterThanOrEqual(5)
    for (const text of messages) {
      expect(text, text).toBe(text.toLowerCase())
      expect(text, text).not.toMatch(/[.!?:;,]$/)
      expect(text, text).not.toMatch(/\/|\.toml|~/)
    }
  })
})
