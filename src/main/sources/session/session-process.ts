import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { errnoOf } from '../errno'

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
 * Control frames are the one exception, and never go up. A `control_request`
 * asking whether a tool may run (`can_use_tool`) is answered here, at once and
 * exactly once, by its `request_id`, with what the injected `decide` says; a
 * `decide` that throws is a deny, and any other subtype is answered with an
 * error, so no turn is left waiting on an answer. The one exception is a
 * request with no `request_id`, which cannot be answered and is dropped; the
 * CLI always sends an id. A cancel is dropped too.
 *
 * The other direction is the interrupt: `interrupt()` writes one `control_request`
 * with a `request_id` of its own and resolves true only for the `control_response`
 * that carries that id with `subtype: 'success'`. Any other subtype, a write that
 * failed and the process closing first resolve false. A `control_response` that
 * no interrupt is waiting for is dropped. The interrupt says the CLI accepted it;
 * it is the turn's `result` that says the turn is over.
 *
 * Stderr is ignored outright, never read: it names files the harness must
 * never show. The exit code is not reported either, because a turn ends on a
 * `result` frame and the process exit is only ever "gone". A write to a pipe
 * that has died is never reported as written: the stream raises after `write`
 * has returned, so a write settles only once the stream has said whether it
 * went. It resolves false on a stream error or a write callback error, and the
 * failure is remembered for the writes after it.
 */

/**
 * The session command's arguments, exactly. Three flags are load-bearing and
 * each is asserted by a test: `--include-partial-messages` (the words arrive
 * as they are written), `--setting-sources project,local` (the user source is
 * excluded, so the session sees only the target project's skills) and
 * `--input-format stream-json` (the agent's skill is a stdin turn, not a
 * positional prompt). `--permission-prompt-tool stdio` sends each call that
 * would prompt here as a `control_request` instead of denying it, and the
 * answer comes from a fixed policy. `--forward-subagent-text` is deliberately
 * absent, and so is any flag that would give the persona an identity or a
 * style (the agent's own skill loads both), a permission mode or a model.
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
  'project,local',
  '--permission-prompt-tool',
  'stdio'
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

/** The skill that runs a room (Story 4.1): the same skill whatever the cast. */
export const ROOM_SKILL = 'bmad-party-mode'

/** One member of a room's cast, as the first turn names them: the id, and the roster's display name. */
export type RoomMember = { id: string; name: string }

/**
 * The turn that activates a room: the party skill's own invocation. When the
 * cast is exactly the roster's agents it is the skill alone, because the skill's
 * default room is the installed agents and a cast would only restate it. A subset
 * is named inline after the skill, `Name (id)` for each member joined by `, `,
 * which the skill reads as the roster for the session
 * (`.claude/skills/bmad-party-mode/SKILL.md`, step 4: "an inline-named cast IS
 * the roster for the session"). Never an argv.
 */
export function roomActivationTurn(cast: readonly RoomMember[], rosterIds: readonly string[]): string {
  const everyone =
    cast.length === rosterIds.length && rosterIds.every((id) => cast.some((member) => member.id === id))
  if (everyone) {
    return `/${ROOM_SKILL}`
  }
  const named = cast.map(({ id, name }) => `${name === '' ? id : name} (${id})`)
  return `/${ROOM_SKILL} ${named.join(', ')}`
}

/** A tool call the CLI asks permission for, as it arrived: neither field is checked here. */
export type PermissionAsk = { toolName: unknown; input: unknown }

/** The answer, in the shape the CLI reads. */
export type PermissionAnswer =
  | { behavior: 'allow'; updatedInput: Record<string, unknown> }
  | { behavior: 'deny'; message: string }

/** The answer to one permission request, as a stdin line. */
export function permissionAnswerLine(requestId: string | number, answer: PermissionAnswer): string {
  const frame = { type: 'control_response', response: { subtype: 'success', request_id: requestId, response: answer } }
  return `${JSON.stringify(frame)}\n`
}

/** One interrupt, which asks the CLI to end the turn in flight, as a stdin line. */
export function interruptLine(requestId: string): string {
  const frame = { type: 'control_request', request_id: requestId, request: { subtype: 'interrupt' } }
  return `${JSON.stringify(frame)}\n`
}

/** A control request this module does not handle, refused by its id as a stdin line. */
export function controlErrorLine(requestId: string | number, error: string): string {
  const frame = { type: 'control_response', response: { subtype: 'error', request_id: requestId, error } }
  return `${JSON.stringify(frame)}\n`
}

/** The frames the CLI and the harness speak to each other in; none is a frame of the conversation. */
const CONTROL_TYPES = new Set(['control_request', 'control_response', 'control_cancel_request'])

/** The deny for a request the policy could not decide. */
const UNDECIDED: PermissionAnswer = { behavior: 'deny', message: 'blocked: the permission check failed' }

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
    write(data: string, callback?: (error?: Error | null) => void): unknown
    on(event: 'error', listener: () => void): unknown
    /** Set by a real stream once it has failed or been closed. */
    destroyed?: boolean
    writable?: boolean
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
  /** Write one user turn. Resolves false when the process is gone or the write failed. */
  write(text: string): Promise<boolean>
  /**
   * Ask the CLI to end the turn in flight, in-band, and keep the session. Resolves
   * true once the CLI has accepted it, false when it refused, the write failed
   * or the process closed first. It never times out: whoever waits sets the limit.
   */
  interrupt(): Promise<boolean>
  /** Kill the process group. */
  kill(): void
}

export type SpawnSessionOptions = {
  /**
   * The persona the session activates, whose skill invocation is the first stdin
   * turn unless `firstTurn` is given. A room has none: it is given `firstTurn` instead.
   */
  agentId?: string
  /**
   * The first stdin turn, in place of the activation: a room's activation, a skill-first session's text, or
   * (with an `agentId`, Story 8.3) the skill a button started a persona's seat with, which is then not activated.
   * It wins over the `agentId`'s own `/<agentId>`.
   */
  firstTurn?: string
  /** The project root. */
  cwd: string
  /** Each parsed stdout line; a line that is not JSON never gets here. */
  onFrame: (frame: unknown) => void
  /** The process has gone. Called once, and only for a process that did spawn. */
  onExit: () => void
  /** Whether a tool call may run. Called once per permission request; a throw is a deny. */
  decide: (ask: PermissionAsk) => PermissionAnswer
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
    /** The pipe has failed: a write to a process that has gone raises on the stream, later than the write. */
    let broken = false
    /** The writes the stream has not yet said anything about. */
    const pending = new Set<(written: boolean) => void>()
    const settleAll = (written: boolean): void => {
      for (const settle of [...pending]) settle(written)
    }

    /** One line on stdin; nothing is attempted once the process or its pipe has gone. */
    const writeLine = (line: string): Promise<boolean> => {
      if (exited || broken || child.stdin.destroyed === true || child.stdin.writable === false) {
        return Promise.resolve(false)
      }
      return new Promise<boolean>((resolveWrite) => {
        const settle = (written: boolean): void => {
          pending.delete(settle)
          resolveWrite(written)
        }
        pending.add(settle)
        try {
          child.stdin.write(line, (error) => {
            if (error !== undefined && error !== null) {
              broken = true
            }
            settle(error === undefined || error === null)
          })
        } catch {
          settle(false)
        }
      })
    }

    /** The interrupts written and not yet answered, by their request ids. */
    const interrupts = new Map<string, (acknowledged: boolean) => void>()
    let interruptCount = 0

    /** A control response is an interrupt's answer when its id is one waiting; any other is dropped. */
    const answerInterrupt = (frame: { response?: unknown }): void => {
      const response =
        typeof frame.response === 'object' && frame.response !== null
          ? (frame.response as { request_id?: unknown; subtype?: unknown })
          : undefined
      if (typeof response?.request_id === 'string') {
        interrupts.get(response.request_id)?.(response.subtype === 'success')
      }
    }

    /** Answer one control request; anything that cannot be answered by an id is dropped. */
    const answerControl = (frame: { request_id?: unknown; request?: unknown }): void => {
      const requestId = frame.request_id
      if (typeof requestId !== 'string' && typeof requestId !== 'number') {
        return
      }
      const request =
        typeof frame.request === 'object' && frame.request !== null
          ? (frame.request as { subtype?: unknown; tool_name?: unknown; input?: unknown })
          : undefined
      if (request?.subtype !== 'can_use_tool') {
        void writeLine(controlErrorLine(requestId, 'unsupported control request'))
        return
      }
      let answer: PermissionAnswer
      try {
        answer = options.decide({ toolName: request.tool_name, input: request.input })
      } catch {
        answer = UNDECIDED
      }
      void writeLine(permissionAnswerLine(requestId, answer))
    }

    const session: SessionProcess = {
      write: (text) => writeLine(userTurnLine(text)),
      interrupt: () =>
        new Promise<boolean>((resolveAcknowledged) => {
          interruptCount += 1
          const requestId = `interrupt-${interruptCount}`
          const settle = (acknowledged: boolean): void => {
            interrupts.delete(requestId)
            resolveAcknowledged(acknowledged)
          }
          interrupts.set(requestId, settle)
          void writeLine(interruptLine(requestId)).then((written) => {
            if (!written) settle(false)
          })
        }),
      kill() {
        kill(child.pid)
      }
    }

    // A write to a process that has gone raises on the stream, after `write`
    // has returned. The error is not shown, but the pipe is dead from then on:
    // the writes waiting on it fail, and the next is refused.
    child.stdin.on('error', () => {
      broken = true
      settleAll(false)
    })

    const lines = createLineSplitter((line) => {
      let frame: unknown
      try {
        frame = JSON.parse(line)
      } catch {
        return
      }
      const type = typeof frame === 'object' && frame !== null ? (frame as { type?: unknown }).type : undefined
      if (typeof type === 'string' && CONTROL_TYPES.has(type)) {
        if (type === 'control_request') answerControl(frame as { request_id?: unknown; request?: unknown })
        if (type === 'control_response') answerInterrupt(frame as { response?: unknown })
        return
      }
      options.onFrame(frame)
    })
    child.stdout.on('data', (chunk) => lines.push(chunk))

    child.on('spawn', () => {
      spawned = true
      void session.write(options.firstTurn ?? activationTurn(options.agentId ?? ''))
      resolve({ ok: true, session })
    })

    child.on('error', (error) => {
      if (!spawned) {
        resolve({ ok: false, errno: errnoOf(error) })
      }
    })

    child.on('close', () => {
      settleAll(false)
      for (const settle of [...interrupts.values()]) settle(false)
      if (spawned && !exited) {
        exited = true
        options.onExit()
      }
    })
  })
}
