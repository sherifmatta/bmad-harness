import { spawn } from 'node:child_process'

/**
 * Run one command, bounded, and say what happened as data.
 *
 * Classification lives here so that nothing above this module ever inspects an
 * `Error`. Stderr is dropped at this boundary: it names files the harness must
 * never show, and no caller has a use for it that the classification below does
 * not already serve.
 */

/** Big enough for any resolver answer; past it the answer is not to be trusted. */
const MAX_BUFFER_BYTES = 4 * 1024 * 1024

export type CommandResult =
  | { ok: true; stdout: string }
  | {
      ok: false
      kind: 'timeout' | 'exit' | 'spawn' | 'output-too-large'
      code?: number
      signal?: string
      errno?: string
    }

export type CommandOptions = {
  timeoutMs: number
  cwd: string
  env: NodeJS.ProcessEnv
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: CommandOptions
) => Promise<CommandResult>

export const runCommand: CommandRunner = (command, args, { timeoutMs, cwd, env }) =>
  new Promise((resolve) => {
    let settled = false
    const settle = (result: CommandResult): void => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve(result)
      }
    }

    // `execFile` does not pass `detached` on, so the child is spawned here. Its
    // own process group lets the whole tree be killed at once: `uv run` keeps
    // the interpreter as a child, and killing only `uv` would leave that
    // interpreter running. Stderr is ignored outright, never read.
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })

    const chunks: Buffer[] = []
    let size = 0
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BUFFER_BYTES) {
        killGroup(child.pid)
        settle({ ok: false, kind: 'output-too-large' })
        return
      }
      chunks.push(chunk)
    })

    const timer = setTimeout(() => {
      killGroup(child.pid)
      settle({ ok: false, kind: 'timeout' })
    }, timeoutMs)

    child.on('error', (error: NodeJS.ErrnoException) => {
      settle({ ok: false, kind: 'spawn', errno: error.code ?? 'failed' })
    })

    child.on('close', (code, signal) => {
      if (code === 0) {
        settle({ ok: true, stdout: Buffer.concat(chunks).toString('utf8') })
      } else {
        settle({
          ok: false,
          kind: 'exit',
          ...(code !== null ? { code } : {}),
          ...(signal !== null ? { signal } : {})
        })
      }
    })
  })

/** Kill a child and everything it started; a group that is already gone is fine. */
function killGroup(pid: number | undefined): void {
  if (pid === undefined) {
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // Already exited.
  }
}
