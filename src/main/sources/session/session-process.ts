import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

/**
 * The one long-lived `claude` process behind one persona's session.
 *
 * This is the only place the harness starts the CLI for a conversation, and
 * the only place that knows its wire framing: the argv, the shape of a user
 * turn on stdin, and that stdout is one JSON frame per line. What a frame
 * means is Fold's business and what to do about it is the bridge's; this
 * module hands each parsed frame up as `unknown` and says when the process is
 * gone.
 *
 * Stderr is ignored outright, never read: it names files the harness must
 * never show. The exit code is not reported either, because a turn ends on a
 * `result` frame and the process exit is only ever "gone".
 */

/**
 * The session command's arguments, exactly. Three flags are load-bearing and
 * each is asserted by a test: `--include-partial-messages` (the words arrive
 * as they are written), `--setting-sources project,local` (the user source is
 * excluded, so the session sees only the target project's skills) and
 * `--input-format stream-json` (the agent's skill is a stdin turn, not a
 * positional prompt). `--forward-subagent-text` is deliberately absent, and so
 * is any flag that would give the persona an identity or a style: the agent's
 * own skill loads both.
 */
export const SESSION_ARGS: readonly string[] = [
  '-p',
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
  '--include-partial-messages',
  '--verbose',
  '--setting-sources',
  'project,local'
]

/** The executable the session runs. */
export const SESSION_COMMAND = 'claude'

/** An agent id is a skill name: it becomes `/<agentId>`, so nothing else may through. */
const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export function isAgentId(value: unknown): value is string {
  return typeof value === 'string' && AGENT_ID_PATTERN.test(value)
}

/** One user turn as the CLI reads it on stdin: a JSON line. */
export function userTurnLine(text: string): string {
  const frame = { type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }
  return `${JSON.stringify(frame)}\n`
}

/** The turn that activates a persona: its own skill invocation, and nothing else. */
export function activationTurn(agentId: string): string {
  return `/${agentId}`
}

/**
 * Split a byte stream into whole lines. A partial line is held until its
 * newline arrives, however many chunks that takes, and a multi-byte character
 * cut across two chunks is whole again before it is read.
 */
export function createLineSplitter(onLine: (line: string) => void): {
  push(chunk: Buffer | string): void
} {
  const decoder = new StringDecoder('utf8')
  let held = ''
  return {
    push(chunk) {
      held += typeof chunk === 'string' ? chunk : decoder.write(chunk)
      let at = held.indexOf('\n')
      while (at !== -1) {
        const line = held.slice(0, at)
        held = held.slice(at + 1)
        onLine(line)
        at = held.indexOf('\n')
      }
    }
  }
}

/** The parts of a child process the session touches, so a test can supply its own. */
export type SessionChild = {
  pid?: number | undefined
  stdin: {
    write(data: string): unknown
    on(event: 'error', listener: () => void): unknown
  }
  stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown }
  on(event: 'spawn', listener: () => void): unknown
  on(event: 'error', listener: (error: NodeJS.ErrnoException) => void): unknown
  on(event: 'close', listener: () => void): unknown
}

export type SessionSpawn = (
  command: string,
  args: readonly string[],
  options: { cwd: string }
) => SessionChild

/** The real spawn: its own process group, stdin and stdout piped, stderr ignored. */
const spawnClaude: SessionSpawn = (command, args, { cwd }) =>
  spawn(command, [...args], {
    cwd,
    windowsHide: true,
    detached: true,
    stdio: ['pipe', 'pipe', 'ignore']
  }) as unknown as SessionChild

/** Kill a child and everything it started; a group that is already gone is fine. */
export function killGroup(pid: number | undefined): void {
  if (pid === undefined) {
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // Already exited.
  }
}

export type SessionProcess = {
  /** Write one user turn. False when the process is gone or the write failed. */
  write(text: string): boolean
  /** Kill the process group. */
  kill(): void
}

export type SpawnSessionOptions = {
  agentId: string
  /** The project root. */
  cwd: string
  /** Each parsed stdout line; a line that is not JSON never gets here. */
  onFrame: (frame: unknown) => void
  /** The process has gone. Called once, and only for a process that did spawn. */
  onExit: () => void
  spawn?: SessionSpawn
  killGroup?: (pid: number | undefined) => void
}

export type SpawnOutcome = { ok: true; session: SessionProcess } | { ok: false; errno: string }

/**
 * Start the process and, once it has spawned, write the activation turn: the
 * agent's own skill invocation, as the first stdin turn. Resolves when the
 * process is up or could not be started; a start that fails (`claude` missing)
 * is reported as its errno code and nothing else.
 */
export function spawnSession(options: SpawnSessionOptions): Promise<SpawnOutcome> {
  const start = options.spawn ?? spawnClaude
  const kill = options.killGroup ?? killGroup

  return new Promise((resolve) => {
    let child: SessionChild
    try {
      child = start(SESSION_COMMAND, SESSION_ARGS, { cwd: options.cwd })
    } catch (error) {
      resolve({ ok: false, errno: errnoOf(error) })
      return
    }

    let spawned = false
    let exited = false

    const session: SessionProcess = {
      write(text) {
        if (exited) {
          return false
        }
        try {
          child.stdin.write(userTurnLine(text))
          return true
        } catch {
          return false
        }
      },
      kill() {
        kill(child.pid)
      }
    }

    // A write to a process that has gone raises on the stream; the session
    // already reports that as the process being gone.
    child.stdin.on('error', () => {})

    const lines = createLineSplitter((line) => {
      let frame: unknown
      try {
        frame = JSON.parse(line)
      } catch {
        return
      }
      options.onFrame(frame)
    })
    child.stdout.on('data', (chunk) => lines.push(chunk))

    child.on('spawn', () => {
      spawned = true
      session.write(activationTurn(options.agentId))
      resolve({ ok: true, session })
    })

    child.on('error', (error) => {
      if (!spawned) {
        resolve({ ok: false, errno: errnoOf(error) })
      }
    })

    child.on('close', () => {
      if (spawned && !exited) {
        exited = true
        options.onExit()
      }
    })
  })
}

function errnoOf(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return typeof code === 'string' ? code : 'failed'
}
