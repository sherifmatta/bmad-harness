import { describe, expect, it, vi } from 'vitest'
import type { CommandResult, CommandRunner } from '../install/run-command'
import { END, LOGIN_PATH_TIMEOUT_MS, START, resolveLoginPath } from './login-path'

const LAUNCHD = '/usr/bin:/bin:/usr/sbin:/sbin'

/** What the login shell prints: the marker pair brackets the PATH, so rc-file chatter around it is ignored. */
const printed = (path: string, noise = ''): CommandResult => ({
  ok: true,
  stdout: `${noise}${START}${path}${END}${noise}`
})

function resolveWith(result: CommandResult, env: NodeJS.ProcessEnv = { PATH: LAUNCHD, SHELL: '/bin/zsh' }) {
  const run = vi.fn<CommandRunner>(async () => result)
  return { run, resolved: resolveLoginPath({ run, env, home: '/Users/me', platform: 'darwin' }) }
}

describe('the login-shell path', () => {
  it('asks the user’s own shell, as a login shell, within a bound', async () => {
    const { run, resolved } = resolveWith(printed('/opt/homebrew/bin:/usr/bin'))

    await resolved

    const [command, args, options] = run.mock.calls[0]
    expect(command).toBe('/bin/zsh')
    expect(args.join(' ')).toMatch(/-\w*l\w*c/)
    expect(options.timeoutMs).toBe(LOGIN_PATH_TIMEOUT_MS)
  })

  it('puts what the shell found ahead of the launchd path, without repeating an entry', async () => {
    const { resolved } = resolveWith(printed('/opt/homebrew/bin:/usr/bin:/Users/me/.local/bin'))

    const path = (await resolved).split(':')

    expect(path.slice(0, 3)).toEqual(['/opt/homebrew/bin', '/usr/bin', '/Users/me/.local/bin'])
    expect(path.filter((entry) => entry === '/usr/bin')).toHaveLength(1)
    expect(path).toContain('/sbin')
  })

  it('ignores whatever an rc file prints around the path', async () => {
    const { resolved } = resolveWith(printed('/opt/homebrew/bin', 'Welcome back!\n'))

    expect((await resolved).split(':')[0]).toBe('/opt/homebrew/bin')
  })

  it('still has the usual install directories when the shell does not answer', async () => {
    const { resolved } = resolveWith({ ok: false, kind: 'timeout' })

    const path = (await resolved).split(':')

    expect(path).toEqual(
      expect.arrayContaining([
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/Users/me/.local/bin',
        '/usr/bin'
      ])
    )
  })

  it('does not trust output with no marker', async () => {
    const { resolved } = resolveWith({ ok: true, stdout: 'just some text' })

    expect(await resolved).not.toContain('just some text')
  })

  it('falls back to /bin/zsh when SHELL is not set', async () => {
    const { run, resolved } = resolveWith(printed('/usr/bin'), { PATH: LAUNCHD })

    await resolved

    expect(run.mock.calls[0][0]).toBe('/bin/zsh')
  })
})
