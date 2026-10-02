import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { ContractEvent } from '../src/shared/events'
import type { AgentView } from '../src/shared/install'
import { foldEvent, hydrate, initialConversation } from '../src/renderer/ui/chat/conversation-state'
import { EMPTY_TRANSCRIPT, foldPersonaSaid } from '../src/main/fold/transcript'

/**
 * Story 2.7's persistence, asserted from the two folds and the sources. The
 * behaviour is held by the unit tests beside each module; what only a contract
 * test can show is that main's transcript and the window's agree on what was
 * said, and that nothing is written, or stored, anywhere it should not be.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

const code = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '')

const shipping = filesUnder(SRC).filter(
  (path) => /\.(?:ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.endsWith('.d.ts')
)
const rel = (path: string): string => relative(ROOT, path)

const mary: AgentView = {
  id: 'bmad-agent-analyst',
  module: 'bmm',
  name: 'Mary',
  title: 'Analyst',
  icon: 'i',
  description: 'd'
}
const agentOf = (id: string): AgentView | undefined => (id === mary.id ? mary : undefined)

const said = (agentId: string | undefined, messageId: string, text: string, at: number): ContractEvent => ({
  name: 'persona:said',
  payload: { sessionId: 's1', ...(agentId === undefined ? {} : { agentId }), messageId, text, at }
})

describe('the transcript main keeps and the one the window folds', () => {
  const sequence: ContractEvent[] = [
    said(mary.id, 'msg_1', ' Hel', 10),
    said(mary.id, 'msg_1', 'lo, ', 11),
    said(undefined, 'room', 'not a persona’s own', 12),
    said(mary.id, 'msg_1', 'there\n\n', 13),
    said(mary.id, 'msg_2', 'A second message', 14),
    said('bmad-agent-pm', 'msg_3', 'Another persona', 15),
    said(mary.id, 'msg_2', ' continued?', 16)
  ]

  it('hold the same messages, with the same ids from the model, the same text and the same times', () => {
    let main = EMPTY_TRANSCRIPT
    let window = initialConversation
    for (const event of sequence) {
      if (event.name === 'persona:said') main = foldPersonaSaid(main, event.payload)
      window = foldEvent(window, event, agentOf).state
    }

    const fromMain = main.entries.map((entry) =>
      entry.kind === 'persona' ? [entry.agentId, entry.messageId, entry.text, entry.at] : []
    )
    const fromWindow = window.entries.map((entry) =>
      entry.kind === 'persona' ? [entry.agent.id, entry.messageId, entry.text, entry.at] : []
    )

    expect(fromMain).toEqual(fromWindow)
    expect(fromMain).toEqual([
      [mary.id, 'msg_1', ' Hello, there\n\n', 10],
      [mary.id, 'msg_2', 'A second message', 14],
      ['bmad-agent-pm', 'msg_3', 'Another persona', 15],
      [mary.id, 'msg_2', ' continued?', 16]
    ])
  })

  it('lets a window that hydrated from main carry on exactly as one that never reloaded', () => {
    const before = sequence.slice(0, 2)
    const after = sequence.slice(2)

    let main = EMPTY_TRANSCRIPT
    for (const event of before) {
      if (event.name === 'persona:said') main = foldPersonaSaid(main, event.payload)
    }
    let reloaded = hydrate(
      initialConversation,
      { entries: [...main.entries], sessions: [], busy: [], personas: [] },
      agentOf
    ).state
    let steady = initialConversation
    for (const event of before) steady = foldEvent(steady, event, agentOf).state
    for (const event of after) {
      reloaded = foldEvent(reloaded, event, agentOf).state
      steady = foldEvent(steady, event, agentOf).state
    }

    const shown = (entries: typeof steady.entries) =>
      entries.map((entry) => (entry.kind === 'persona' ? [entry.messageId, entry.text] : []))
    expect(shown(reloaded.entries)).toEqual(shown(steady.entries))
  })
})

describe('what is stored, and where', () => {
  it('is written by the one persistence source and nowhere else', () => {
    const writers = shipping.filter((path) =>
      /\b(?:writeFileSync|writeFile|appendFile|appendFileSync|renameSync|createWriteStream)\b/.test(code(path))
    )

    expect(writers.map(rel)).toEqual(['src/main/sources/persistence/transcript-file.ts'])
  })

  it('is read from userData only by the composition root and the bridge’s default', () => {
    const askers = shipping.filter((path) => /getPath\(\s*['"]userData['"]/.test(code(path)))

    expect(askers.map(rel).sort()).toEqual(['src/main/index.ts', 'src/main/session-bridge.ts'])
  })

  it('leaves the renderer with no storage of its own', () => {
    for (const path of shipping.filter((p) => p.startsWith(join(SRC, 'renderer')))) {
      expect(code(path), rel(path)).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
    }
  })

  it('stores no session, persona state, queue or install model: the file holds the transcript alone', () => {
    const file = code(join(SRC, 'main/sources/persistence/transcript-file.ts'))

    expect(file).not.toMatch(/sessions|busy|personas|queue|install/i)
    expect(code(join(SRC, 'shared/conversation.ts'))).toMatch(/version: 1/)
  })

  it('is cleared only by ending the conversation: one caller of clear(), and one writer of an empty transcript', () => {
    const callers = shipping.filter((path) => /forProject\([^)]*\)\.clear\(\)/.test(code(path)))
    const writers = shipping.filter((path) => /\bwriteTranscript\(|\bwrite\(filePath/.test(code(path)))

    expect(callers.map(rel)).toEqual(['src/main/session-bridge.ts'])
    expect(code(join(SRC, 'main/session-bridge.ts')).match(/forProject\([^)]*\)\.clear\(\)/g)).toHaveLength(1)
    // The file is written by the projection (through the source's own function) and nowhere else, and it writes an empty list only in `clear`.
    expect(writers.map(rel)).toEqual([
      'src/main/projections/transcript.ts',
      'src/main/sources/persistence/transcript-file.ts'
    ])
    expect(code(join(SRC, 'main/projections/transcript.ts')).match(/write\(filePath, projectPath, \[\]\)/g)).toHaveLength(1)
  })

  it('names no command or event the contract did not already have', () => {
    const events = code(join(SRC, 'shared/events.ts'))
    const commands = code(join(SRC, 'shared/commands.ts'))

    expect([...events.matchAll(/^\s{2}'([a-z-]+:[a-z-]+)': EventSpec/gm)]).toHaveLength(14)
    expect([...commands.matchAll(/^\s{2}'([a-z]+\.[a-z]+)': CommandSpec/gm)]).toHaveLength(7)
    expect(events + commands).not.toMatch(/conversation:get|getConversation/)
  })
})
