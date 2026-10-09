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

  it('leaves sixteen events', () => {
    const source = stripped(read('src/shared/events.ts'))
    const body = source.slice(source.indexOf('export type ContractEvents = {'))
    expect([...body.matchAll(/^ {2}'([a-z-]+:[a-z-]+)': EventSpec</gm)]).toHaveLength(16)
  })

  it('leaves the room no channel of its own: thirty-three in all, four the Welcome’s, three the theme’s, one the output folder’s and three the layout’s', () => {
    expect(Object.values(channels)).toHaveLength(33)
  })

  it('leaves twenty-one preload methods, the eighteenth the output folder’s chooser and the last three the layout’s', () => {
    expect([...read('src/preload/harness-api.d.ts').matchAll(/^ {2}[a-zA-Z]+\(/gm)]).toHaveLength(21)
  })

  it('widens the argument of session.open and leaves its reply as it was', () => {
    const commands = stripped(read('src/shared/commands.ts'))
    expect(commands).toContain('export type SessionTarget = AgentId | { room: readonly AgentId[] }')
    expect(commands).toMatch(/'session\.open': CommandSpec<\s*\[target: SessionTarget\],\s*'[^']+',\s*CommandReply<\{ sessionId: SessionId \}>\s*>/)
    expect(stripped(read('src/preload/harness-api.d.ts'))).toContain('openSession(target: SessionTarget): Promise<OpenedSession>')
  })

  it('gains the live room on the open reply and the conversation snapshot as optional fields only (Story 4.7)', () => {
    const conversation = stripped(read('src/shared/conversation.ts'))
    expect(conversation).toMatch(/export type SessionOpenReply = CommandReply<\{[^}]*room\?: \{ cast: AgentId\[\]; openedAt: EpochMs \}/)
    expect(conversation).toMatch(/export type OpenedSession = \{[^}]*room\?: \{ cast: AgentId\[\]; openedAt: EpochMs \}/)
    expect(conversation).toMatch(/room\?: \{ sessionId: SessionId; cast: AgentId\[\]; openedAt: EpochMs \}\n\s*busy: SessionId\[\]/)
  })
})

describe('the party view’s files', () => {
  const PARTY = 'src/renderer/ui/party'
  const sources = filesUnder(PARTY).filter((path) => /\.(?:ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path))

  it('exist, so the sweep below is not over nothing', () => {
    expect(sources.map((path) => path.split('/').pop()).sort()).toEqual(['cast-chooser.tsx', 'cast-strip.tsx', 'party-header.tsx', 'party-turn.tsx', 'party-view.tsx', 'room-panel.tsx'])
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

describe('what the room’s header and panel do not draw (Story 4.3)', () => {
  const PARTY = 'src/renderer/ui/party'
  const files = filesUnder(PARTY).filter((path) => /\.(?:ts|tsx|css)$/.test(path) && !/\.test\.tsx?$/.test(path))

  it('has no party file that names a deferred section, a pause control or the superseded width', () => {
    for (const path of files) {
      const source = stripped(read(path))
      expect(source, path).not.toMatch(/disagree|Decisions so far|Open disagreements|Pause|\b288/i)
    }
  })

  it('has no live region and no role in the header or the panel', () => {
    for (const name of ['party-header.tsx', 'room-panel.tsx']) {
      expect(stripped(read(`${PARTY}/${name}`)), name).not.toMatch(/aria-live|role=|role:/)
    }
  })

  it('gives the panel exactly one heading and the shell’s own class', () => {
    const panel = stripped(read(`${PARTY}/room-panel.tsx`))
    expect(panel.match(/<h[1-6]\b/g)).toHaveLength(1)
    expect(panel).toContain('className="party-side"')
    expect(panel).toMatch(/aria-label="room"/)
  })

  it('leaves the panel’s display to the shell’s breakpoint, and the panel at --party-side', () => {
    const css = stripped(read(`${PARTY}/room-panel.css`))
    const rule = css.match(/\.party-side\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).not.toBe('')
    expect(rule).not.toMatch(/\bdisplay\b/)
    expect(css).toContain('var(--party-side)')
    expect(css).toContain('var(--party-side-key)')
    expect(stripped(read('src/renderer/ui/shell/shell.css'))).toMatch(/@media \(max-width: 1180px\)\s*\{\s*\.party-side,\s*\.panel-splitter--room\s*\{\s*display: none;/)
  })

  it('wires the header button in the app to the conversation, which only asks the room to write', () => {
    expect(stripped(read('src/renderer/ui/app.tsx'))).toContain('onWriteSummary={rail === null ? undefined : () => conversation.writeSummary(rail.folder)}')
    expect(stripped(read(`${PARTY}/party-header.tsx`))).toContain('disabled={onWriteSummary === undefined || folder === undefined}')
  })

  it('wires `stop room` in the app to the conversation, as the room’s own close and never the end of the conversation (Story 4.5)', () => {
    expect(stripped(read('src/renderer/ui/app.tsx'))).toContain('onStop={() => void conversation.stopRoom()}')
    expect(stripped(read(`${PARTY}/party-header.tsx`))).toMatch(/onStop !== undefined &&/)
    expect(stripped(read(`${PARTY}/party-header.tsx`))).toContain('stop room')
    const hook = stripped(read('src/renderer/ui/chat/use-conversation.ts'))
    const from = hook.indexOf('async stopRoom()')
    const to = hook.indexOf('async end(projectId)')
    expect(from).toBeGreaterThanOrEqual(0)
    expect(to).toBeGreaterThan(from)
    const body = hook.slice(from, to)
    expect(body.length).toBeGreaterThan(0)
    expect(body).toContain('bridge.closeSession(room)')
    expect(body).not.toMatch(/endConversation|commit\(/)
  })

  it('writes nothing of the summary: no renderer or main source names the party directory or writes a file for it', () => {
    const sources = [...filesUnder('src/renderer'), ...filesUnder('src/main')].filter(
      (path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)
    )
    for (const path of sources) {
      expect(stripped(read(path)), path).not.toMatch(/_bmad\/party/)
    }
    for (const path of filesUnder('src/renderer').filter((file) => /\.tsx?$/.test(file) && !/\.test\./.test(file))) {
      expect(stripped(read(path)), path).not.toMatch(/node:fs|from 'fs'|require\(['"]fs/)
    }
  })
})
