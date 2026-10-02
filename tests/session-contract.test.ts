import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { SESSION_ARGS, SESSION_COMMAND, spawnSession } from '../src/main/sources/session/session-process'
import type { SessionChild } from '../src/main/sources/session/session-process'

/**
 * Story 2.4's session, asserted from its own constants and sources. The
 * behaviour (spawn, fold, serialise, close) is held by the unit tests beside
 * each module; what only a contract test can show is that the three flags the
 * conversation depends on are there, that the flags the product must never pass
 * are not, and that the wire vocabulary stays out of the renderer.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

/** Block comments and whole-line `//` comments removed. */
const code = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '')

const shipping = filesUnder(SRC).filter(
  (path) => /\.(?:ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.endsWith('.d.ts')
)
const rel = (path: string): string => relative(ROOT, path)

const valueOf = (flag: string): string | undefined => SESSION_ARGS[SESSION_ARGS.indexOf(flag) + 1]

describe('the session argv', () => {
  it('runs claude in print mode with stream-json both ways', () => {
    expect(SESSION_COMMAND).toBe('claude')
    expect(SESSION_ARGS[0]).toBe('-p')
    expect(valueOf('--input-format')).toBe('stream-json')
    expect(valueOf('--output-format')).toBe('stream-json')
    expect(SESSION_ARGS).toContain('--verbose')
  })

  it('carries the three load-bearing flags', () => {
    expect(SESSION_ARGS).toContain('--include-partial-messages')
    expect(valueOf('--setting-sources')).toBe('project,local')
    expect(valueOf('--input-format')).toBe('stream-json')
  })

  it('never forwards subagent text, injects an identity or a style, or sets a permission mode or a model', () => {
    for (const flag of [
      '--forward-subagent-text',
      '--append-system-prompt',
      '--system-prompt',
      '--permission-mode',
      '--model'
    ]) {
      expect(SESSION_ARGS, flag).not.toContain(flag)
    }
  })

  it('has no positional argument: the agent is a stdin turn, not a prompt', () => {
    const values = new Set(['stream-json', 'project,local'])
    const positional = SESSION_ARGS.filter(
      (arg, at) => !arg.startsWith('-') && !values.has(arg) && !SESSION_ARGS[at - 1]?.startsWith('--')
    )
    expect(positional).toEqual([])
  })

  it('is spelled in one source file, and nowhere in the shipping tree names the forbidden flags', () => {
    const spelling = shipping.filter((path) => code(path).includes('--include-partial-messages'))
    expect(spelling.map(rel)).toEqual(['src/main/sources/session/session-process.ts'])

    for (const path of shipping) {
      expect(code(path), rel(path)).not.toMatch(
        /forward-subagent-text|append-system-prompt|--system-prompt|--permission-mode|--model\b/
      )
    }
  })
})

describe('the first line written', () => {
  it('is / and the agent id as a user turn, and the only thing the harness sends on open', async () => {
    const writes: string[] = []
    const listeners = new Map<string, () => void>()
    const child = {
      pid: undefined,
      stdin: {
        write: (data: string) => void writes.push(data),
        on: () => undefined
      },
      stdout: { on: () => undefined },
      on: (event: string, listener: () => void) => void listeners.set(event, listener)
    } as unknown as SessionChild
    const pending = spawnSession({
      agentId: 'bmad-agent-architect',
      cwd: '/x',
      spawn: () => child,
      onFrame: () => {},
      onExit: () => {}
    })
    listeners.get('spawn')?.()
    await pending

    expect(writes).toHaveLength(1)
    expect(JSON.parse(writes[0])).toEqual({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: '/bmad-agent-architect' }] }
    })
  })
})

describe('the layers', () => {
  it('has Sources that do not import Fold, and a bridge that imports both', () => {
    for (const path of filesUnder(join(SRC, 'main/sources/session')).filter((file) => /\.ts$/.test(file))) {
      expect(code(path), rel(path)).not.toMatch(/from '[^']*\/fold\//)
    }
    const bridge = code(join(SRC, 'main/session-bridge.ts'))

    expect(bridge).toMatch(/from '\.\/fold\/route-frame'/)
    expect(bridge).toMatch(/from '\.\/fold\/turn-end'/)
    expect(bridge).toMatch(/from '\.\/sources\/session\/session-process'/)
  })

  it('keeps the process start in Sources: no child_process in the bridge or the fold', () => {
    for (const path of [join(SRC, 'main/session-bridge.ts'), ...filesUnder(join(SRC, 'main/fold'))]) {
      expect(code(path), rel(path)).not.toMatch(/child_process/)
    }
  })

  it('reads no stderr and passes no environment of its own', () => {
    const source = code(join(SRC, 'main/sources/session/session-process.ts'))

    expect(source).toContain("stdio: ['pipe', 'pipe', 'ignore']")
    expect(source).not.toMatch(/\bstderr\b|\benv\b/)
  })

  it('names the wire word for a finished turn in the fold alone', () => {
    const naming = shipping.filter((path) => /['"`]result['"`]/.test(code(path)))

    expect(naming.map(rel)).toEqual(['src/main/fold/turn-end.ts'])
  })
})

describe('the persona states', () => {
  const fold = join(SRC, 'main/fold/persona-state.ts')

  it('are folded in Fold alone: no I/O, no wall clock, no layer above it', () => {
    const source = code(fold)

    expect(source).not.toMatch(/from 'node:|from 'electron'|child_process|\bsetTimeout\b|\bsetInterval\b/)
    expect(source).not.toMatch(/Date\.now|new Date\(|Math\.random|performance\.now/)
    expect(source).not.toMatch(/from '\.\.\/(?:projections|sources|windows)\//)
  })

  it('are held by one projection that both bridges feed through the one per-window holder', () => {
    expect(code(join(SRC, 'main/projections/personas.ts'))).toMatch(/from '\.\.\/fold\/persona-state'/)
    for (const bridge of ['main/session-bridge.ts', 'main/rail-bridge.ts']) {
      expect(code(join(SRC, bridge)), bridge).toMatch(/personaProjectionFor/)
      expect(code(join(SRC, bridge)), bridge).toMatch(/from '\.\/persona-states'/)
    }
  })

  it('travel on the one session channel, spelled once in main', () => {
    const spelling = shipping.filter(
      (path) => path.startsWith(join(SRC, 'main')) && code(path).includes("'session:event'")
    )

    expect(spelling.map(rel)).toEqual(['src/main/persona-states.ts'])
  })

  it('are set by no renderer file: the window only stores what main reports', () => {
    const setters = shipping.filter(
      (path) =>
        path.startsWith(join(SRC, 'renderer')) &&
        /name: 'persona:state'|\.state\s*=[^=]/.test(code(path))
    )

    expect(setters).toEqual([])
  })
})

describe('the renderer', () => {
  const renderer = shipping.filter((path) => path.startsWith(join(SRC, 'renderer')))

  it('holds no result or frame vocabulary: it is told events and never parses a frame', () => {
    expect(renderer.length).toBeGreaterThan(40)
    for (const path of renderer) {
      expect(code(path), rel(path)).not.toMatch(
        /['"`]result['"`]|stream_event|text_delta|input_json_delta|content_block|message_start|parent_tool_use_id|error_during_execution|is_error|stream-json/
      )
    }
  })

  it('reaches the session through its preload methods and nothing else', () => {
    const users = renderer.filter((path) => /window\.harness\??\.(?:openSession|sendTurn|getConversation|endConversation|onSessionEvent)/.test(code(path)))

    expect(users.map(rel)).toEqual(['src/renderer/ui/chat/use-conversation.ts'])
  })
})
