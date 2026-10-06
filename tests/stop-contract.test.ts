import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { guardedStylesheets, literalsIn, withoutComments } from './literal-guard'

/**
 * Story 3.7's stop, asserted from its sources: what only a contract test can
 * show is what is not there. The behaviour is held by the unit tests beside each
 * module, `tests/stop-replay.test.ts` (the recording) and
 * `tests/relaunch-dead-card.test.ts` (the stored cards).
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

// The renderer's test support (`ui/testing/`) is never shipped, and holds the patterns the audits look for.
const shipping = filesUnder(SRC).filter(
  (path) =>
    /\.(?:ts|tsx)$/.test(path) &&
    !/\.test\.tsx?$/.test(path) &&
    !path.endsWith('.d.ts') &&
    !path.startsWith(join(SRC, 'renderer/ui/testing'))
)
const main = shipping.filter((path) => path.startsWith(join(SRC, 'main')))
const renderer = shipping.filter((path) => path.startsWith(join(SRC, 'renderer')))
const rel = (path: string): string => relative(ROOT, path)

const STOP = join(SRC, 'main/session-stop.ts')
const RUN_STOP_TSX = join(SRC, 'renderer/ui/chat/run-stop.tsx')
const RUN_STOP_CSS = 'src/renderer/ui/chat/run-stop.css'
const tokens = readFileSync(join(SRC, 'renderer/design/tokens.css'), 'utf8')

describe('the in-band interrupt', () => {
  it('is never a signal: no SIGINT is named anywhere in main, and the one kill is the group’s SIGKILL', () => {
    for (const path of main) {
      expect(code(path), rel(path)).not.toMatch(/SIGINT|SIGTERM|SIGHUP/)
    }
  })

  it('is asked for once per stop request: one call in session-stop, one line written by the process for it', () => {
    expect([...code(STOP).matchAll(/\.interrupt\(\)/g)]).toHaveLength(1)
    const process = code(join(SRC, 'main/sources/session/session-process.ts'))
    expect([...process.matchAll(/interruptLine\(/g)]).toHaveLength(2)
    expect(process).toContain("request: { subtype: 'interrupt' }")
  })

  it('spells no frame outside the session process: the stop names neither control_request nor control_response', () => {
    const naming = main.filter((path) => /control_request|control_response/.test(code(path)))

    expect(naming.map(rel)).toEqual(['src/main/sources/session/session-process.ts'])
  })

  it('waits STOP_ACK_MS, which is three seconds, on the injected schedule and not on a timer of its own', () => {
    const stop = code(STOP)

    expect(stop).toMatch(/export const STOP_ACK_MS = 3000\b/)
    expect(stop).toContain('kit.schedule(')
    expect(stop).not.toMatch(/setTimeout|setInterval|Date\.now|performance\.now/)
  })
})

describe('what a stop never touches', () => {
  it('holds no path to a project file: the stop imports no file system and names no way back', () => {
    const stop = code(STOP)

    expect(stop).not.toMatch(/from 'node:fs|from 'fs'|require\(/)
    expect(stop).not.toMatch(/revert|restore|undo|unlink|writeFile|rename|\brm\b/i)
  })

  it('offers no revert, restore or undo anywhere in main or the window, and no control or line in it says resume', () => {
    // Story 3.10's notifier restores one thing, the minimized project window, by Electron's own word
    // for the inverse of minimize: `window.restore()`, named once in its window type and once in the call.
    const NOTIFIER = join(SRC, 'main/windows/run-notification.ts')
    for (const path of [...main, ...renderer]) {
      if (path === NOTIFIER) continue
      expect(code(path), rel(path)).not.toMatch(/\b(?:revert|restore|undo)\w*/i)
    }
    const notifier = code(NOTIFIER)
    expect(notifier.match(/\b(?:revert|restore|undo)\w*/gi)).toEqual(['restore', 'restore'])
    expect(notifier).toMatch(/if \(window\.isMinimized\(\)\) window\.restore\(\)/)
    expect(notifier).not.toMatch(/node:fs|unlink|writeFile|rename|\brm\b/)
    for (const path of renderer) {
      expect(code(path), rel(path)).not.toMatch(/(?:['"`>])\s*resume\b/i)
    }
  })

  it('writes the file system from the one persistence source alone, which the run cards now ride in', () => {
    const writers = main.filter((path) => /\b(?:writeFileSync|writeFile|appendFile|renameSync|unlinkSync|createWriteStream)\b/.test(code(path)))

    expect(writers.map(rel)).toEqual(['src/main/sources/persistence/transcript-file.ts'])
  })

  it('changes no status, event or command of the contract: four run statuses, one stopped payload, seven commands', () => {
    const conversation = code(join(SRC, 'shared/conversation.ts'))
    const events = code(join(SRC, 'shared/events.ts'))
    const commands = code(join(SRC, 'shared/commands.ts'))

    expect(conversation).toContain("export type RunStatus = 'running' | 'finished' | 'stopped' | 'failed'")
    expect(events).toContain('export type RunStopped = { runId: RunId; sessionId: SessionId; at: EpochMs }')
    expect([...commands.matchAll(/^\s{2}'([a-z]+\.[a-z]+)': CommandSpec/gm)]).toHaveLength(7)
    expect(commands).toContain("'run.stop': CommandSpec<[runId: RunId], 'once per stop request', CommandReply>")
  })

  it('names the stop’s reply code once, in the bridge that answers it, and the window swallows exactly that code', () => {
    const named = shipping.filter((path) => /run\/not-found/.test(code(path)))

    expect(named.map(rel).sort()).toEqual(['src/main/session-bridge.ts', 'src/renderer/ui/chat/use-conversation.ts'])
  })
})

describe('the stop control', () => {
  it('is drawn by one component and one stylesheet, and only the run card and its line draw that component', () => {
    const drawers = renderer.filter((path) => /<RunStop\b/.test(code(path)))

    expect(drawers.map(rel).sort()).toEqual(['src/renderer/ui/chat/run-card-line.tsx', 'src/renderer/ui/chat/run-card.tsx'])
    expect(renderer.filter((path) => /run-stop\.css/.test(code(path))).map(rel)).toEqual(['src/renderer/ui/chat/run-stop.tsx'])
  })

  it('reads `stop` and carries no confirmation, cost, spinner, tooltip, badge, toast or sound', () => {
    const text = code(RUN_STOP_TSX)

    expect(text).toMatch(/>\s*stop\s*</)
    expect(text).not.toMatch(/confirm|dialog|modal|cost|spinner|skeleton|(?<![\w-])title\s*=|tooltip|popover|badge|toast|Audio|sound|aria-live|announce/i)
  })

  it('is governed by the literal guard and reaches every value through a token declared in tokens.css', () => {
    expect(guardedStylesheets()).toContain(RUN_STOP_CSS)
    const css = readFileSync(join(ROOT, RUN_STOP_CSS), 'utf8')
    expect(literalsIn(RUN_STOP_CSS, css)).toEqual([])
    const declared = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name))
    const used = [...withoutComments(css).matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name)
    expect(used.length).toBeGreaterThan(5)
    expect(used.filter((name) => !declared.has(name))).toEqual([])
  })

  it('spends the dim tier for its text, not the faint one, and restates no focus ring', () => {
    const css = withoutComments(readFileSync(join(ROOT, RUN_STOP_CSS), 'utf8'))

    expect(css).toMatch(/color:\s*var\(--dim\)/)
    expect(css).not.toMatch(/--faint|--meta\b|--ink-doc-mute|--topbar-sep/)
    expect(css).not.toMatch(/:focus|outline|box-shadow|transition|animation|@keyframes/)
  })

  it('takes its two new values from tokens.css, as the mockup’s control is drawn', () => {
    expect(tokens).toMatch(/--run-stop-padding:1px 6px;/)
    expect(tokens).toMatch(/--run-stop-inset:11px;/)
  })
})
