import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import type { CommandResult, CommandRunner } from '../install/run-command'
import { PREFLIGHT_TIMEOUT_MS, createPrerequisiteChecks } from './tools'

function checksWith(...results: CommandResult[]) {
  const queue = [...results]
  const run = vi.fn<CommandRunner>(async () => {
    const next = queue.shift()
    if (next === undefined) {
      throw new Error('no more scripted answers')
    }
    return next
  })
  return { run, checks: createPrerequisiteChecks({ run }) }
}

const json = (value: unknown): CommandResult => ({ ok: true, stdout: JSON.stringify(value) })
const exit = (code: number): CommandResult => ({ ok: false, kind: 'exit', code })

const DETAIL =
  /^(exceeded \d+ms|exit \d+|signal [A-Z0-9]+|spawn [A-Za-z0-9_]+|output was not json|output was not the expected shape|python \d+\.\d+(\.\d+)?|no python found)$/

describe('the argument vectors', () => {
  it('runs claude auth status, and nothing that starts a session', async () => {
    const { run, checks } = checksWith(json({ loggedIn: true }))

    await checks.checkClaude()

    expect(run).toHaveBeenCalledTimes(1)
    const [command, args, options] = run.mock.calls[0]
    expect(command).toBe('claude')
    expect(args).toEqual(['auth', 'status'])
    expect(options.cwd).toBe(tmpdir())
    expect(options.timeoutMs).toBe(PREFLIGHT_TIMEOUT_MS)
    expect(PREFLIGHT_TIMEOUT_MS).toBe(15_000)
  })

  it('runs the constrained find, and stops there when it passes', async () => {
    const { run, checks } = checksWith({ ok: true, stdout: '3.14.7\n' })

    expect(await checks.checkUv()).toEqual({ ok: true })

    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][0]).toBe('uv')
    expect(run.mock.calls[0][1]).toEqual(['python', 'find', '--no-project', '--show-version', '>=3.11'])
    expect(run.mock.calls[0][2].cwd).toBe(tmpdir())
  })

  it('runs the unconstrained find only after the constrained one exits non-zero', async () => {
    const { run, checks } = checksWith(exit(2), { ok: true, stdout: '3.9.6\n' })

    await checks.checkUv()

    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[1][1]).toEqual(['python', 'find', '--no-project', '--show-version'])
  })

  it('honours an injected bound, working directory and environment', async () => {
    const run = vi.fn<CommandRunner>(async () => json({ loggedIn: true }))
    const env = { PATH: '/nowhere' }
    await createPrerequisiteChecks({ run, timeoutMs: 7, cwd: '/elsewhere', env }).checkClaude()

    expect(run.mock.calls[0][2]).toEqual({ timeoutMs: 7, cwd: '/elsewhere', env })
  })
})

describe('checkClaude', () => {
  it('passes for exit 0 with loggedIn true', async () => {
    expect(await checksWith(json({ loggedIn: true })).checks.checkClaude()).toEqual({ ok: true })
  })

  it('names a missing claude for a spawn ENOENT', async () => {
    const result = await checksWith({ ok: false, kind: 'spawn', errno: 'ENOENT' }).checks.checkClaude()

    expect(result).toMatchObject({ ok: false, kind: 'claude-missing' })
  })

  it.each([
    ['exit 1', exit(1)],
    ['exit 0 with loggedIn false', json({ loggedIn: false, authMethod: 'none' })]
  ])('names a signed-out claude for %s', async (_name, answer) => {
    expect(await checksWith(answer).checks.checkClaude()).toMatchObject({
      ok: false,
      kind: 'claude-unauthenticated'
    })
  })

  it.each([
    ['a timeout', { ok: false, kind: 'timeout' } as CommandResult, 'exceeded 15000ms'],
    ['exit 2', exit(2), 'exit 2'],
    ['a signal', { ok: false, kind: 'exit', signal: 'SIGKILL' } as CommandResult, 'signal SIGKILL'],
    ['another spawn error', { ok: false, kind: 'spawn', errno: 'EACCES' } as CommandResult, 'spawn EACCES'],
    ['garbage', { ok: true, stdout: 'garbage' } as CommandResult, 'output was not json'],
    ['an empty object', json({}), 'output was not the expected shape'],
    ['a string loggedIn', json({ loggedIn: 'true' }), 'output was not the expected shape'],
    ['null', { ok: true, stdout: 'null' } as CommandResult, 'output was not the expected shape'],
    ['oversized output', { ok: false, kind: 'output-too-large' } as CommandResult, 'output was not the expected shape']
  ])('could not conclude for %s', async (_name, answer, detail) => {
    const result = await checksWith(answer).checks.checkClaude()

    expect(result).toMatchObject({ ok: false, kind: 'check-failed', detail })
    expect(detail).toMatch(DETAIL)
  })

  it('never lets the account or a path into any field', async () => {
    const answer = json({ loggedIn: false, email: 'a@b.c', configDirectory: '/Users/x/.claude' })
    const result = await checksWith(answer).checks.checkClaude()

    const text = JSON.stringify(result)
    for (const leaked of ['a@b.c', 'Users', 'configDirectory']) {
      expect(text).not.toContain(leaked)
    }
  })
})

describe('checkUv', () => {
  it('names a missing uv for a spawn ENOENT on the first find', async () => {
    const { run, checks } = checksWith({ ok: false, kind: 'spawn', errno: 'ENOENT' })

    expect(await checks.checkUv()).toMatchObject({ ok: false, kind: 'uv-missing' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('names a Python below 3.11 with what uv found', async () => {
    const result = await checksWith(exit(2), { ok: true, stdout: '3.9.6\n' }).checks.checkUv()

    expect(result).toMatchObject({ ok: false, kind: 'uv-python-old', detail: 'python 3.9.6' })
  })

  it('accepts a two-part version', async () => {
    const result = await checksWith(exit(2), { ok: true, stdout: '3.9' }).checks.checkUv()

    expect(result).toMatchObject({ kind: 'uv-python-old', detail: 'python 3.9' })
  })

  it('cannot conclude when the first find is killed by a signal, and asks no more', async () => {
    const { run, checks } = checksWith({ ok: false, kind: 'exit', signal: 'SIGKILL' })

    expect(await checks.checkUv()).toMatchObject({
      ok: false,
      kind: 'check-failed',
      detail: 'signal SIGKILL'
    })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('cannot conclude when the unconstrained find contradicts the constrained one', async () => {
    const result = await checksWith(exit(2), { ok: true, stdout: '3.14.7\n' }).checks.checkUv()

    expect(result).toMatchObject({
      ok: false,
      kind: 'check-failed',
      detail: 'output was not the expected shape'
    })
  })

  it('names no python at all when both finds exit non-zero', async () => {
    const result = await checksWith(exit(2), exit(2)).checks.checkUv()

    expect(result).toMatchObject({ ok: false, kind: 'uv-python-old', detail: 'no python found' })
  })

  it.each([
    ['injection after a newline', '3.9.6\nrm -rf'],
    ['a path', '/usr/bin/python3'],
    ['words', 'Python 3.9.6'],
    ['nothing', '']
  ])('refuses %s as a version and cannot conclude', async (_name, printed) => {
    const result = await checksWith(exit(2), { ok: true, stdout: printed }).checks.checkUv()

    expect(result).toMatchObject({
      ok: false,
      kind: 'check-failed',
      detail: 'output was not the expected shape'
    })
    expect(JSON.stringify(result)).not.toContain('rm')
    expect(JSON.stringify(result)).not.toContain('/usr')
  })

  it.each([
    ['a timeout on the first find', [{ ok: false, kind: 'timeout' } as CommandResult], 'exceeded 15000ms'],
    ['another spawn error on the first find', [{ ok: false, kind: 'spawn', errno: 'EACCES' } as CommandResult], 'spawn EACCES'],
    ['a timeout on the second find', [exit(2), { ok: false, kind: 'timeout' } as CommandResult], 'exceeded 15000ms'],
    ['a signal on the second find', [exit(2), { ok: false, kind: 'exit', signal: 'SIGSEGV' } as CommandResult], 'signal SIGSEGV']
  ])('cannot conclude for %s', async (_name, answers, detail) => {
    const result = await checksWith(...answers).checks.checkUv()

    expect(result).toMatchObject({ ok: false, kind: 'check-failed', detail })
    expect(detail).toMatch(DETAIL)
  })

  it('never puts a path or stderr text into any field', async () => {
    const results = [
      await checksWith(exit(2), { ok: true, stdout: '/opt/homebrew/bin/python3' }).checks.checkUv(),
      await checksWith(exit(2), exit(2)).checks.checkUv(),
      await checksWith({ ok: false, kind: 'spawn', errno: '/bad/errno' }).checks.checkUv()
    ]

    for (const result of results) {
      expect(JSON.stringify(result)).not.toContain('/')
    }
  })
})
