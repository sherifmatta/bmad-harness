import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The contract is asserted from its source because it is types only: there is
 * no value to import and check. Each event and command must be named with a
 * payload and a stated cardinality, every event must originate in main, and the
 * declaring files must hold no behaviour. The renderer, preload and shared
 * sources must not know the CLI's wire format.
 */

const ROOT = resolve(import.meta.dirname, '..')

const EVENTS = [
  'session:opened',
  'session:awaiting-turn',
  'session:closed',
  'persona:said',
  'harness:said',
  'persona:state',
  'run:started',
  'run:note',
  'run:step',
  'doc:section-opened',
  'doc:prose',
  'doc:committed',
  'run:finished',
  'run:stopped',
  'run:failed',
  'rail:changed',
  'board:changed'
]

const COMMANDS = [
  'session.open',
  'session.close',
  'turn.send',
  'menu.dispatch',
  'run.stop',
  'turn.stop',
  'doc.open',
  'conversation.end'
]

const CONTRACT_FILES = ['src/shared/events.ts', 'src/shared/commands.ts', 'src/shared/ids.ts']

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

/** Block comments blanked and whole-line `//` comments removed; string contents are not treated specially. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '')
}

function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

/** The text of the `ContractEvents` / `ContractCommands` map body. */
function mapBody(source: string, name: string): string {
  const start = source.indexOf(`export type ${name} = {`)
  expect(start, `${name} is declared`).toBeGreaterThanOrEqual(0)
  return source.slice(start, source.indexOf('\n}\n', start))
}

/** Splits a map body into its entries, keyed by the quoted name. */
function entries(body: string): Map<string, string> {
  const found = new Map<string, string>()
  const heads = [...body.matchAll(/^ {2}'([^']+)': /gm)]
  heads.forEach((head, at) => {
    const end = at + 1 < heads.length ? heads[at + 1].index : body.length
    found.set(head[1], body.slice(head.index + head[0].length, end))
  })
  return found
}

describe('the events out', () => {
  const body = mapBody(withoutComments(read('src/shared/events.ts')), 'ContractEvents')
  const declared = entries(body)

  it('are exactly the seventeen', () => {
    expect([...declared.keys()]).toEqual(EVENTS)
  })

  it('are named noun:verb-past', () => {
    for (const name of EVENTS) expect(name).toMatch(/^[a-z]+:[a-z]+(-[a-z]+)*$/)
  })

  it.each(EVENTS)('%s declares main as its origin, a stated cardinality and a payload', (name) => {
    expect(declared.get(name)).toMatch(/^EventSpec<\s*'main',\s*(?:'[^']+'|"[^"]+"),\s*[A-Za-z]+\s*>/)
  })

  it('admit no origin but main', () => {
    const source = read('src/shared/events.ts')
    expect(source).toMatch(/EventSpec<Origin extends 'main'/)
    expect(body).not.toMatch(/renderer|preload/i)
  })

  it('carry a run note as the memlog line main observed, naming no tool call (Story 3.1)', () => {
    const source = withoutComments(read('src/shared/events.ts'))
    const start = source.indexOf('export type RunNote = {')
    const fields = [...source.slice(start, source.indexOf('\n}', start)).matchAll(/^ {2}(\w+)\??:/gm)].map(([, field]) => field)
    expect(fields).toEqual(['runId', 'sessionId', 'text', 'pulled', 'at'])
  })

  it('reuse the rail snapshot rather than redefine it', () => {
    expect(declared.get('rail:changed')).toMatch(/RailSnapshot\s*>/)
  })

  it('push the Board’s snapshot once per revision, and carry no other payload for it (Story 6.9)', () => {
    expect(declared.get('board:changed')).toMatch(/^EventSpec<\s*'main',\s*'once per board revision',\s*BoardSnapshot\s*>/)
  })

  it('answer the Board’s one read with the snapshot or the envelope, and nothing else (Story 6.9)', () => {
    const board = withoutComments(read('src/shared/board.ts'))

    expect(board).toMatch(/export type BoardSnapshot = BoardBody & \{ revision: number \}/)
    expect(board).toMatch(/export type BoardReply =\s*\|\s*\{ ok: true; snapshot: BoardSnapshot \}\s*\|\s*\{ ok: false; error: HarnessError \}/)
    // The body is one of two: a file that was read, or the one code and message that say there is none.
    expect(board).toMatch(/\{ kind: 'read'; epics: BoardEpic\[\]; others: BoardOther\[\] \}/)
    expect(board).toMatch(/\{ kind: 'none'; code: string; message: string \}/)
  })
})

describe('the Board’s files (Story 7.1)', () => {
  const board = withoutComments(read('src/shared/board.ts'))

  it('are one optional `file` on a story and on an epic, additive, and carried nowhere else', () => {
    expect(board).toMatch(/export type BoardStory = BoardEntry & \{[^}]*\bfile\?: string \}/)
    expect(board).toMatch(/export type BoardEpic = BoardEntry & \{[^}]*\bfile\?: string\n\}/)
    expect(board.match(/\bfile\??:/g)).toHaveLength(2)
    expect([...withoutComments(read('src/shared/channels.ts')).matchAll(/\bBOARD_\w+_CHANNEL\b/g)].map(([name]) => name).sort()).toEqual(['BOARD_CHANGED_CHANNEL', 'BOARD_GET_CHANNEL'])
  })

  it('leave the contract version as it was', () => {
    expect(read('src/shared/events.ts')).toMatch(/export const CONTRACT_VERSION = 1\n/)
  })
})

describe('the install’s skills (Story 7.3)', () => {
  const install = withoutComments(read('src/shared/install.ts'))

  it('are one required `skills` field of the install snapshot, of name and description, and carried nowhere else', () => {
    expect(install).toMatch(/export type SkillView = \{ name: string; description: string \}/)
    expect(install.match(/\bskills: SkillView\[\]/g)).toHaveLength(1)
    expect(install.slice(install.indexOf('export type InstallSnapshot'))).toMatch(/preflight: HarnessError\[\]\n\s*(?:\/\*\*[\s\S]*?\*\/\s*)?skills: SkillView\[\]\n\}/)
    for (const file of ['channels', 'commands', 'events']) {
      expect(withoutComments(read(`src/shared/${file}.ts`)), file).not.toMatch(/\bSkillView\b|\bskills\b/)
    }
  })

  it('add no channel, command or bridge method, and leave the contract version as it was', () => {
    expect(read('src/shared/events.ts')).toMatch(/export const CONTRACT_VERSION = 1\n/)
    expect(COMMANDS).toHaveLength(8)
    expect(withoutComments(read('src/shared/channels.ts')).match(/export const \w+_CHANNEL\b/g)).toHaveLength(36)
    // The bridge's own method count is pinned in `bridge-contract.test.ts` (twenty-four), and no preload file gained one for this.
    expect(withoutComments(read('src/preload/harness-api.d.ts'))).not.toMatch(/\bskills?\b/i)
  })
})

describe('the skill-first session’s fields (Story 7.5, audited by Story 7.6)', () => {
  const conversation = withoutComments(read('src/shared/conversation.ts'))
  const events = withoutComments(read('src/shared/events.ts'))
  const commands = withoutComments(read('src/shared/commands.ts'))

  /** The fields a declared type holds at its own top level, in order, `?` kept: nested object types are one field each. */
  function fieldsOf(source: string, name: string): string[] {
    const start = source.indexOf(`export type ${name} = {`)
    expect(start, `${name} is declared`).toBeGreaterThanOrEqual(0)
    const body = source.slice(start, source.indexOf('\n}', start))
    return [...body.matchAll(/^ {2}(\w+\??):/gm)].map(([, field]) => field)
  }

  it('is one `SkillRecord` of the transcript, carrying the session it was said in, beside the three records that were', () => {
    expect(conversation.match(/export type SkillRecord = \{/g)).toHaveLength(1)
    expect(fieldsOf(conversation, 'SkillRecord')).toEqual(['kind', 'id', 'at', 'messageId', 'text', 'skillSession'])
    expect(conversation).toMatch(/export type TranscriptRecord = PersonaRecord \| UserRecord \| SyslineRecord \| SkillRecord\n/)
    expect(conversation).toMatch(/kind: 'skill'/)
  })

  it('is `skillSession` required on the skill’s own record and optional on exactly the user record, the sysline record and the persona:said and harness:said events, and on no persona record or run card', () => {
    // Five declarations in all: three in conversation.ts (the skill record’s required one, the user record’s and the sysline record’s) and two in events.ts.
    expect(conversation.match(/\bskillSession\??:/g)).toHaveLength(3)
    expect(events.match(/\bskillSession\??:/g)).toHaveLength(2)
    expect(fieldsOf(conversation, 'UserRecord')).toContain('skillSession?')
    expect(fieldsOf(conversation, 'SyslineRecord')).toContain('skillSession?')
    expect(fieldsOf(events, 'PersonaSaid')).toContain('skillSession?')
    expect(fieldsOf(events, 'HarnessSaid')).toContain('skillSession?')
    for (const name of ['PersonaRecord', 'RunCardSnapshot']) {
      expect(fieldsOf(conversation, name), name).not.toContain('skillSession')
      expect(fieldsOf(conversation, name), name).not.toContain('skillSession?')
    }
    for (const name of ['SessionOpened', 'SessionClosed', 'RunStarted', 'RunFinished', 'RunStopped', 'RunFailed']) {
      expect(fieldsOf(events, name), name).not.toContain('skillSession?')
    }
  })

  it('is `skill` on the session opened and closed events, the open’s reply in both its forms, the run, and the two session listings', () => {
    expect(fieldsOf(events, 'SessionOpened')).toEqual(['sessionId', 'agentId?', 'skill?', 'at'])
    expect(fieldsOf(events, 'SessionClosed')).toEqual(['sessionId', 'agentId?', 'skill?', 'reason', 'at'])
    expect(events.match(/\bskill\??:/g)).toHaveLength(3)
    expect(fieldsOf(events, 'RunStarted')).toContain('skill?')
    expect(conversation.match(/\bskill\??:/g)).toHaveLength(5)
    expect(fieldsOf(conversation, 'OpenedSession')).toContain('skill?')
    // `SessionOpenReply` is the envelope of the same reply: its one object declares the same optional field.
    const reply = conversation.slice(conversation.indexOf('export type SessionOpenReply'), conversation.indexOf('export type OpenedSession'))
    expect(reply.match(/^ {2}skill\?: string$/gm)).toHaveLength(1)
    expect(conversation).toContain('export type StoredSkillSession = { sessionId: SessionId; skill: string; at: EpochMs }')
    expect(conversation).toMatch(/skillSessions\?: \{ sessionId: SessionId; skill: string; live: boolean \}\[\]\n\}/)
  })

  it('is `skillSessions` on the conversation snapshot and the stored file, both optional, and the `{ first: string }` target of session.open once', () => {
    expect(conversation.match(/\bskillSessions\??:/g)).toHaveLength(2)
    expect(fieldsOf(conversation, 'ConversationSnapshot')).toEqual(['entries', 'sessions', 'room?', 'busy', 'personas', 'runs', 'skillSessions?'])
    expect(fieldsOf(conversation, 'TranscriptFile')).toEqual(['version', 'projectPath', 'entries', 'runs?', 'skillSessions?'])
    expect(commands.match(/\{ first: string \}/g)).toHaveLength(1)
    expect(commands).toContain('export type SessionTarget = AgentId | { room: readonly AgentId[] } | { first: string }')
  })

  it('adds no command, event, channel or bridge method, and leaves the contract at version 1 with 8, 17, 36 and 24', () => {
    expect(read('src/shared/events.ts')).toMatch(/export const CONTRACT_VERSION = 1\n/)
    expect(COMMANDS).toHaveLength(8)
    expect(EVENTS).toHaveLength(17)
    expect(withoutComments(read('src/shared/channels.ts')).match(/export const \w+_CHANNEL\b/g)).toHaveLength(36)
    expect([...withoutComments(read('src/preload/harness-api.d.ts')).matchAll(/^ {2}[a-zA-Z]+\(/gm)]).toHaveLength(24)
    // The two earlier additive pins of this epic stand as they were: one `file` each on a story and an epic, one `skills` on the install.
    expect(withoutComments(read('src/shared/board.ts')).match(/\bfile\??:/g)).toHaveLength(2)
    expect(withoutComments(read('src/shared/install.ts')).match(/\bskills: SkillView\[\]/g)).toHaveLength(1)
  })
})

describe('the commands in', () => {
  const body = mapBody(withoutComments(read('src/shared/commands.ts')), 'ContractCommands')
  const declared = entries(body)

  it('are exactly the eight', () => {
    expect([...declared.keys()]).toEqual(COMMANDS)
  })

  it.each(COMMANDS)('%s declares its arguments, a stated cardinality and a reply', (name) => {
    expect(declared.get(name)).toMatch(/^CommandSpec<\s*\[[^\]]*\],\s*'[^']+',\s*CommandReply/)
  })

  it('carry the signatures the epic names', () => {
    const args = (name: string): string =>
      (declared.get(name)?.match(/\[([^\]]*)\]/)?.[1] ?? '').replace(/:\s*[A-Za-z]+/g, '').replace(/\s+/g, '')
    // A persona's agent id, or from Story 4.1 the room's cast: one argument, `SessionTarget`.
    expect(args('session.open')).toBe('target')
    expect(args('session.close')).toBe('sessionId')
    expect(args('turn.send')).toBe('sessionId,text,mention?')
    expect(args('menu.dispatch')).toBe('sessionId,code')
    expect(args('run.stop')).toBe('runId')
    expect(args('turn.stop')).toBe('sessionId')
    expect(args('doc.open')).toBe('path')
    expect(args('conversation.end')).toBe('projectId')
  })
})

describe('the contract files hold no behaviour', () => {
  it.each(CONTRACT_FILES)('%s has no function, class, enum or runtime value', (path) => {
    const code = withoutComments(read(path))
    expect(code).not.toMatch(/\bfunction\b|\bclass\b|\benum\b|=>/)
    const values = [...code.matchAll(/^export (?:const|let|var)\s+(\w+)/gm)].map((match) => match[1])
    expect(values).toEqual(path.endsWith('events.ts') ? ['CONTRACT_VERSION'] : [])
  })

  it('versions the contract with one literal', () => {
    expect(withoutComments(read('src/shared/events.ts'))).toMatch(/export const CONTRACT_VERSION = \d+\n/)
  })
})

describe('the CLI wire format stays in main', () => {
  const RAW =
    /\b(?:stream_event|input_json_delta|text_delta|parent_tool_use_id|content_block_start|content_block_delta|content_block_stop|message_start|partial_json|tool_use)\b/
  const sources = ['src/renderer', 'src/preload', 'src/shared']
    .flatMap(filesUnder)
    .filter((path) => /\.(?:ts|tsx|css|html)$/.test(path))

  it('is named by nothing under renderer, preload or shared', () => {
    expect(sources.length).toBeGreaterThan(0)
    const offenders = sources.filter((path) => RAW.test(read(path))).map((path) => relative('.', path))
    expect(offenders).toEqual([])
  })

  it('keeps raw-frame types out of shared', () => {
    for (const path of sources.filter((file) => file.startsWith('src/shared'))) {
      expect(read(path)).not.toMatch(/\bFrameInput\b|\bRouteState\b/)
    }
  })
})
