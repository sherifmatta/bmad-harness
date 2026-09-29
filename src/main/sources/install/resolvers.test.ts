import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import type { CommandResult, CommandRunner } from './run-command'
import { createInstallSource } from './resolvers'

const ROOT = '/work/project'

function sourceWith(result: CommandResult, extra: { timeoutMs?: number } = {}) {
  const run = vi.fn<CommandRunner>(async () => result)
  return { run, source: createInstallSource({ projectRoot: ROOT, run, ...extra }) }
}

const ok = (json: unknown): CommandResult => ({ ok: true, stdout: JSON.stringify(json) })

const agent = {
  module: 'bmm',
  team: 't',
  name: 'Mary',
  title: 'Analyst',
  icon: 'i',
  description: 'd'
}

describe('the resolver invocations', () => {
  it('runs the roster resolver through uv with an absolute script, no shell, and the guarded env', async () => {
    const { run, source } = sourceWith(ok({ agents: { 'bmad-agent-a': agent } }))

    const roster = await source.resolveRoster()

    expect(run).toHaveBeenCalledTimes(1)
    const [command, args, options] = run.mock.calls[0]
    expect(command).toBe('uv')
    expect(args).toEqual([
      'run',
      '--no-project',
      '--quiet',
      `${ROOT}/_bmad/scripts/resolve_config.py`,
      '--project-root',
      ROOT,
      '--key',
      'agents'
    ])
    expect(options.env.PYTHONDONTWRITEBYTECODE).toBe('1')
    expect(options.cwd).toBe(tmpdir())
    expect(options.cwd).not.toBe(ROOT)
    expect(options.timeoutMs).toBeGreaterThan(0)
    expect(roster.ok && roster.agents.map((a) => a.id)).toEqual(['bmad-agent-a'])
  })

  it('runs the menu resolver against the skill directory composed from the id', async () => {
    const { run, source } = sourceWith(ok({ 'agent.menu': [] }))

    await source.resolveMenu('bmad-agent-a', 'Mary')

    expect(run.mock.calls[0][1]).toEqual([
      'run',
      '--no-project',
      '--quiet',
      `${ROOT}/_bmad/scripts/resolve_customization.py`,
      '--skill',
      `${ROOT}/.claude/skills/bmad-agent-a`,
      '--project-root',
      ROOT,
      '--key',
      'agent.menu'
    ])
  })

  it('honours an injected bound and working directory', async () => {
    const run = vi.fn<CommandRunner>(async () => ok({}))
    await createInstallSource({ projectRoot: ROOT, run, timeoutMs: 123, cwd: '/elsewhere' }).resolveRoster()

    expect(run.mock.calls[0][2]).toMatchObject({ timeoutMs: 123, cwd: '/elsewhere' })
  })

  it('refuses an unsafe id before any process is run', async () => {
    const { run, source } = sourceWith(ok({}))

    const menu = await source.resolveMenu('../../x')

    expect(run).not.toHaveBeenCalled()
    expect(menu).toMatchObject({ ok: false, failure: { kind: 'unexpected-shape' } })
  })
})

describe('the failure classes', () => {
  const cases: [string, CommandResult, string, string][] = [
    ['non-zero exit', { ok: false, kind: 'exit', code: 1 }, 'invocation-failed', 'exit 1'],
    ['killed by signal', { ok: false, kind: 'exit', signal: 'SIGTERM' }, 'invocation-failed', 'signal SIGTERM'],
    ['spawn failure', { ok: false, kind: 'spawn', errno: 'ENOENT' }, 'invocation-failed', 'spawn ENOENT'],
    ['oversized output', { ok: false, kind: 'output-too-large' }, 'invocation-failed', 'output too large'],
    ['timeout', { ok: false, kind: 'timeout' }, 'timeout', 'exceeded 15000ms'],
    ['not json', { ok: true, stdout: 'garbage' }, 'unexpected-shape', 'output was not json']
  ]

  it.each(cases)('maps %s and keeps stderr out of detail', async (_name, result, kind, detail) => {
    const { source } = sourceWith(result)

    for (const answer of [await source.resolveRoster(), await source.resolveMenu('bmad-agent-a')]) {
      expect(answer.ok).toBe(false)
      if (!answer.ok) {
        expect(answer.failure.kind).toBe(kind)
        expect(answer.failure.detail).toBe(detail)
        expect(answer.failure.detail).not.toContain('/')
        expect(answer.failure.detail).not.toContain('.toml')
      }
    }
  })

  it('rejects a wrong-shaped roster with the failing path', async () => {
    const { source } = sourceWith(ok({ agents: [] }))

    expect(await source.resolveRoster()).toMatchObject({
      ok: false,
      failure: { kind: 'unexpected-shape', detail: 'agents · expected an object' }
    })
  })
})
