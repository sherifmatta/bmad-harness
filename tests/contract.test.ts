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
  'doc:section-opened',
  'doc:prose',
  'doc:committed',
  'run:finished',
  'run:stopped',
  'run:failed',
  'rail:changed'
]

const COMMANDS = [
  'session.open',
  'session.close',
  'turn.send',
  'menu.dispatch',
  'run.stop',
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

  it('are exactly the fifteen', () => {
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
})

describe('the commands in', () => {
  const body = mapBody(withoutComments(read('src/shared/commands.ts')), 'ContractCommands')
  const declared = entries(body)

  it('are exactly the seven', () => {
    expect([...declared.keys()]).toEqual(COMMANDS)
  })

  it.each(COMMANDS)('%s declares its arguments, a stated cardinality and a reply', (name) => {
    expect(declared.get(name)).toMatch(/^CommandSpec<\s*\[[^\]]*\],\s*'[^']+',\s*CommandReply/)
  })

  it('carry the signatures the epic names', () => {
    const args = (name: string): string =>
      (declared.get(name)?.match(/\[([^\]]*)\]/)?.[1] ?? '').replace(/:\s*[A-Za-z]+/g, '').replace(/\s+/g, '')
    expect(args('session.open')).toBe('agentId')
    expect(args('session.close')).toBe('sessionId')
    expect(args('turn.send')).toBe('sessionId,text')
    expect(args('menu.dispatch')).toBe('sessionId,code')
    expect(args('run.stop')).toBe('runId')
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
