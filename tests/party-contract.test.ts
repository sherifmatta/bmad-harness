import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import * as channels from '../src/shared/channels'

/**
 * Story 4.1 widens one command's argument and adds nothing else: the room is a session of
 * the same kind as a persona's, opened through `session.open`. These are the counts the
 * epic fixes, asserted together so that a new command, event, channel or preload method
 * added for the room fails here by name, and the layering of the party files.
 */

const ROOT = resolve(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const stripped = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, '')

function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

describe('what the room did not add', () => {
  it('leaves seven commands', () => {
    const source = stripped(read('src/shared/commands.ts'))
    const body = source.slice(source.indexOf('export type ContractCommands = {'))
    expect([...body.matchAll(/^ {2}'([a-z]+\.[a-z]+)': CommandSpec</gm)]).toHaveLength(7)
  })

  it('leaves fifteen events', () => {
    const source = stripped(read('src/shared/events.ts'))
    const body = source.slice(source.indexOf('export type ContractEvents = {'))
    expect([...body.matchAll(/^ {2}'([a-z-]+:[a-z-]+)': EventSpec</gm)]).toHaveLength(15)
  })

  it('leaves twenty-two channels', () => {
    expect(Object.values(channels)).toHaveLength(22)
  })

  it('leaves seventeen preload methods', () => {
    expect([...read('src/preload/harness-api.d.ts').matchAll(/^ {2}[a-zA-Z]+\(/gm)]).toHaveLength(17)
  })

  it('widens the argument of session.open and leaves its reply as it was', () => {
    const commands = stripped(read('src/shared/commands.ts'))
    expect(commands).toContain('export type SessionTarget = AgentId | { room: readonly AgentId[] }')
    expect(commands).toMatch(/'session\.open': CommandSpec<\s*\[target: SessionTarget\],\s*'[^']+',\s*CommandReply<\{ sessionId: SessionId \}>\s*>/)
    expect(stripped(read('src/preload/harness-api.d.ts'))).toContain('openSession(target: SessionTarget): Promise<OpenedSession>')
  })
})

describe('the party view’s files', () => {
  const PARTY = 'src/renderer/ui/party'
  const sources = filesUnder(PARTY).filter((path) => /\.(?:ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path))

  it('exist, so the sweep below is not over nothing', () => {
    expect(sources.map((path) => path.split('/').pop()).sort()).toEqual(['cast-chooser.tsx', 'cast-strip.tsx', 'party-turn.tsx', 'party-view.tsx'])
  })

  it('reach outside the renderer only into `shared/`: never main, preload or the bridge', () => {
    for (const path of sources) {
      const specifiers = [...stripped(read(path)).matchAll(/from\s+'([^']+)'|import\(\s*'([^']+)'/g)].map(
        ([, from, dynamic]) => from ?? dynamic
      )
      for (const specifier of specifiers) {
        if (!specifier.startsWith('.')) {
          expect(specifier, path).toMatch(/^react(?:\/|$)|^react-dom(?:\/|$)/)
          continue
        }
        const target = relative(ROOT, resolve(dirname(join(ROOT, path)), specifier))
        const outside = !target.startsWith('src/renderer/')
        if (outside) {
          expect(target, `${path} imports ${specifier}`).toMatch(/^src\/shared\//)
        }
        expect(target, `${path} imports ${specifier}`).not.toMatch(/^src\/(?:main|preload)\b/)
        expect(specifier, path).not.toMatch(/window\.harness/)
      }
      expect(stripped(read(path)), path).not.toMatch(/window\.harness|ipcRenderer/)
    }
  })

  it('spend tokens only: no literal colour, size or font in the stylesheets', () => {
    for (const path of filesUnder(PARTY).filter((held) => held.endsWith('.css'))) {
      const css = stripped(read(path))
      expect(css, path).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em)\b|rgba?\(|font-family:\s*(?!var\()\S/)
      expect(css, path).not.toMatch(/@keyframes|spinner|skeleton/)
      // Story 4.2: the cast strip spends the two motion tokens the design names and nothing else:
      // the equaliser's and the speaker change's. A second declaration of motion is not allowed here.
      const motion = [...css.matchAll(/(?<![\w-])(?:animation|transition)(?:-[a-z-]+)?\s*:\s*([^;]*);/g)]
      for (const [, value] of motion) {
        const spent = value.replace(/\s+/g, ' ').trim()
        expect(
          path.endsWith('cast-strip.css') &&
            (spent === 'var(--motion-eq)' ||
              /^var\(--eq-delay-[123]\)$/.test(spent) ||
              /^(?:opacity|border-color|background) var\(--motion-cast\)(?:, (?:opacity|border-color|background) var\(--motion-cast\))*$/.test(spent)),
          `${path}: ${spent}`
        ).toBe(true)
      }
    }
  })

  it('draw no disagreement, evidence or unresolved chrome, and nothing in the cast strip announces', () => {
    for (const path of sources) {
      expect(stripped(read(path)), path).not.toMatch(/disagrees|evidence|unresolved/i)
    }
    expect(stripped(read(`${PARTY}/cast-strip.tsx`))).not.toMatch(/aria-live|role=|role:/)
  })
})
