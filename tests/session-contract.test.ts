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

  it('sends each call that would prompt to the harness as a control request on stdout', () => {
    expect(valueOf('--permission-prompt-tool')).toBe('stdio')
    expect(SESSION_ARGS.filter((arg) => arg === '--permission-prompt-tool')).toHaveLength(1)
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
    const values = new Set(['stream-json', 'project,local', 'stdio'])
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
      onExit: () => {},
      decide: () => ({ behavior: 'deny', message: 'x' })
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
    // The registry folds frames and so imports Fold; the bridge starts the process and so imports Sources.
    const registry = code(join(SRC, 'main/session-registry.ts'))
    const bridge = code(join(SRC, 'main/session-bridge.ts'))

    expect(registry).toMatch(/from '\.\/fold\/route-frame'/)
    expect(registry).toMatch(/from '\.\/fold\/turn-end'/)
    expect(registry).toMatch(/from '\.\/fold\/permission-policy'/)
    expect(registry).toMatch(/from '\.\/sources\/session\/session-process'/)
    expect(bridge).toMatch(/from '\.\/sources\/session\/session-process'/)
    expect(bridge).toMatch(/from '\.\/sources\/session\/canonical-path'/)
    expect(bridge).toMatch(/from '\.\/session-registry'/)
  })

  it('answers control requests in Sources alone: no fold, projection or bridge names a control frame', () => {
    const naming = shipping.filter((path) => /control_request|control_response|can_use_tool/.test(code(path)))

    expect(naming.map(rel)).toEqual(['src/main/sources/session/session-process.ts'])
  })

  it('keeps the process start in Sources: no child_process in the bridge or the fold', () => {
    for (const path of [
      join(SRC, 'main/session-bridge.ts'),
      join(SRC, 'main/session-registry.ts'),
      ...filesUnder(join(SRC, 'main/fold'))
    ]) {
      expect(code(path), rel(path)).not.toMatch(/child_process/)
    }
  })

  it('leaves every live seat alone when the install changes: nothing that reads the install reaches the session registry or ends a session (Story 7.4)', () => {
    for (const path of [
      join(SRC, 'main/install-bridge.ts'),
      join(SRC, 'main/install-model.ts'),
      join(SRC, 'main/projections/install.ts')
    ]) {
      expect(code(path), rel(path)).not.toMatch(/session-registry|session-bridge|closeSessions?\b|\.kill\(/)
    }
  })

  it('reads no stderr and passes no environment of its own', () => {
    const source = code(join(SRC, 'main/sources/session/session-process.ts'))

    expect(source).toContain("stdio: ['pipe', 'pipe', 'ignore']")
    expect(source).not.toMatch(/\bstderr\b|\benv\b/)
  })

  it('names the wire word for a finished turn in the fold alone', () => {
    const naming = shipping.filter((path) => /['"`]result['"`]/.test(code(path)))

    expect(naming.map(rel)).toEqual(['src/main/fold/frame.ts'])
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

  it('travel on the one session channel, spelled once in the shared channels module', () => {
    const spelling = shipping.filter((path) => code(path).includes("'session:event'"))

    expect(spelling.map(rel)).toEqual(['src/shared/channels.ts'])
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
    const users = renderer.filter((path) => /window\.harness\??\.(?:openSession|closeSession|sendTurn|stopRun|getConversation|endConversation|onSessionEvent)/.test(code(path)))

    expect(users.map(rel)).toEqual(['src/renderer/ui/chat/use-conversation.ts'])
  })
})

describe('a session outlives the install changing under it (Story 2.11)', () => {
  const installPath = [
    'main/install-bridge.ts',
    'main/install-model.ts',
    'main/projections/install.ts',
    ...filesUnder(join(SRC, 'main/sources/install'))
      .filter((path) => /\.ts$/.test(path) && !/\.test\.ts$/.test(path))
      .map((path) => relative(SRC, path)),
    ...filesUnder(join(SRC, 'main/sources/preflight'))
      .filter((path) => /\.ts$/.test(path) && !/\.test\.ts$/.test(path))
      .map((path) => relative(SRC, path))
  ]

  it('reads the install path it claims to sweep', () => {
    expect(installPath.length).toBeGreaterThanOrEqual(6)
  })

  it('has an install path that imports, calls and signals no session: no session, transcript, persona-state or conversation module', () => {
    for (const path of installPath) {
      const text = code(join(SRC, path))
      expect(text, path).not.toMatch(
        /from '[^']*(?:session-bridge|session-process|persona-states|projections\/personas|projections\/transcript|fold\/(?:route-frame|turn-end|persona-state|written-paths|transcript))'/
      )
      expect(text, path).not.toMatch(/session:close|closeSession|closeSessions|SESSION_/)
    }
  })

  it('lets a session end by exactly five causes in main: the command, conversation.end, the process, the window and a stop the CLI did not acknowledge', () => {
    const bridge =
      code(join(SRC, 'main/session-bridge.ts')) +
      code(join(SRC, 'main/session-registry.ts')) +
      code(join(SRC, 'main/session-stop.ts'))
    const finishes = [...bridge.matchAll(/\bfinish\(/g)].length
    const kills = [...bridge.matchAll(/\.kill\(\)/g)].map(([text]) => text)

    // The registry's type and definition of it, closeSessions (conversation.end and the window), the process's exit,
    // session.close in the bridge, and the one call in `session-stop.ts` that ends the session of a stop nobody answered.
    expect(finishes).toBe(6)
    expect(kills.length).toBe(4)
    expect(bridge).toMatch(/SESSION_CLOSE_CHANNEL,/)
    // An acknowledged stop closes and kills nothing: the one kill sits after the acknowledgement check.
    const stop = code(join(SRC, 'main/session-stop.ts'))
    expect(stop.indexOf('.kill()')).toBeGreaterThan(stop.indexOf('if (accepted'))
  })

  it('reads install in one direction: the session bridge asks for a name, the install modules never ask the session', () => {
    expect(code(join(SRC, 'main/session-bridge.ts'))).toMatch(/from '\.\/install-model'/)
    expect(code(join(SRC, 'main/install-model.ts'))).not.toMatch(/session/i)
  })
})

describe('the run folds (Story 3.1)', () => {
  // `skills` (Story 7.3, audited by 7.6) is the install's manifest as rows in and a list out: the same purity.
  const FOLDS = ['section-headings', 'coalesce', 'memlog-tail', 'run-card', 'route-frame', 'frame', 'skills'].map((name) =>
    join(SRC, 'main/fold', `${name}.ts`)
  )

  it('are pure: no I/O, no timer and no wall clock — time arrives as an argument', () => {
    for (const path of FOLDS) {
      const source = code(path)
      expect(source, rel(path)).not.toMatch(/from 'node:(?!path')|from 'electron'|child_process|\bsetTimeout\b|\bsetInterval\b/)
      expect(source, rel(path)).not.toMatch(/Date\.now|new Date\(|Math\.random|performance\.now|readFile|writeFile/)
      expect(source, rel(path)).not.toMatch(/from '\.\.\/(?:projections|sources|windows)\//)
    }
  })

  it('hold the install’s skills as a fold in `fold/` and their one reader in `sources/`, which nothing else of main reads (Story 7.6)', () => {
    const READER = join(SRC, 'main/sources/install/skill-manifest.ts')
    const FOLD = join(SRC, 'main/fold/skills.ts')
    expect(rel(FOLD)).toBe('src/main/fold/skills.ts')
    expect(readdirSync(join(SRC, 'main/fold'))).toContain('skills.ts')
    expect(readdirSync(join(SRC, 'main/sources/install'))).toContain('skill-manifest.ts')
    // The reader reads the file and says nothing of what it means; the fold says what it means and reads nothing.
    expect(code(READER)).toMatch(/readFile/)
    expect(code(FOLD)).not.toMatch(/readFile|from 'node:|skill-manifest/)
    // Of everything shipped, the reader alone names the manifest file, and the fold alone reads its columns by name.
    expect(shipping.filter((path) => /skill-manifest\.csv/.test(code(path))).map(rel)).toEqual([rel(READER)])
    expect(code(FOLD)).toMatch(/header\.indexOf\('name'\)/)
    expect(shipping.filter((path) => /\.indexOf\('(?:name|description)'\)/.test(code(path)) && /manifest|skill/i.test(path)).map(rel)).toEqual([rel(FOLD)])
    // The reader is imported by the install's own sources and nowhere else: no fold, projection, bridge or window.
    const importers = shipping.filter((path) => /from '[^']*skill-manifest'/.test(code(path))).map(rel)
    expect(importers.length).toBeGreaterThan(0)
    expect(importers.filter((path) => !path.startsWith('src/main/sources/install/'))).toEqual([])
    expect(shipping.filter((path) => path.startsWith(join(SRC, 'renderer')) && /skill-manifest|foldSkills/.test(code(path)))).toEqual([])
  })

  it('leave reading the memlog to Sources and timing the prose to the run’s injected schedule', () => {
    expect(code(join(SRC, 'main/session-run.ts'))).toMatch(/kit\.schedule\(/)
    expect(code(join(SRC, 'main/session-run.ts'))).toMatch(/kit\.readText\(/)
    expect(code(join(SRC, 'main/session-bridge.ts'))).toMatch(/from '\.\/sources\/project\/read-text'/)
  })
})
