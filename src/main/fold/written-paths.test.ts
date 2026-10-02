import { describe, expect, it } from 'vitest'
import { foldWrittenPaths, initialWrittenState, withWrittenPaths } from './written-paths'
import type { WrittenState } from './written-paths'

const ROOT = '/work/project'

type Parent = { parent?: string | null }

const stream = (event: unknown, { parent = null }: Parent = {}) => ({
  type: 'stream_event',
  event,
  parent_tool_use_id: parent
})
const messageStart = (id: string, p?: Parent) => stream({ type: 'message_start', message: { id } }, p)
const toolStart = (index: number, name: string, id: string, p?: Parent) =>
  stream({ type: 'content_block_start', index, content_block: { type: 'tool_use', id, name, input: {} } }, p)
const jsonDelta = (index: number, partial: string, p?: Parent) =>
  stream({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: partial } }, p)
const stop = (index: number, p?: Parent) => stream({ type: 'content_block_stop', index }, p)

function fragments(input: Record<string, unknown>, size: number): string[] {
  const json = JSON.stringify(input)
  const pieces: string[] = ['']
  for (let at = 0; at < json.length; at += size) pieces.push(json.slice(at, at + size))
  return pieces
}

function write(name: string, input: Record<string, unknown>, size = 7, index = 1, parent: Parent = {}) {
  return [
    toolStart(index, name, `toolu_${index}`, parent),
    ...fragments(input, size).map((piece) => jsonDelta(index, piece, parent)),
    stop(index, parent)
  ]
}

function run(frames: unknown[], from: WrittenState = initialWrittenState): { state: WrittenState; paths: string[] } {
  let state = from
  const paths: string[] = []
  for (const frame of frames) {
    const folded = foldWrittenPaths(state, frame, ROOT)
    state = folded.state
    paths.push(...folded.paths)
  }
  return { state, paths }
}

describe('foldWrittenPaths', () => {
  it('names the project-relative path of a closed Write, however its input is split', () => {
    for (const size of [1, 3, 7, 64]) {
      const { paths } = run([
        messageStart('m1'),
        ...write('Write', { file_path: `${ROOT}/_bmad/planning-artifacts/prd.md`, content: '# PRD\n'.repeat(40) }, size)
      ])
      expect(paths, `size ${size}`).toEqual(['_bmad/planning-artifacts/prd.md'])
    }
  })

  it('names an Edit too, and takes a path already relative to the project as it is', () => {
    const { paths } = run([
      messageStart('m1'),
      ...write('Edit', { file_path: 'docs/a.md', old_string: 'x', new_string: 'y' }),
      ...write('Write', { content: 'late', file_path: '/work/project/docs/b.md' }, 5, 2)
    ])

    expect(paths).toEqual(['docs/a.md', 'docs/b.md'])
  })

  it('names nothing until the block closes', () => {
    const frames = [messageStart('m1'), ...write('Write', { file_path: `${ROOT}/a.md`, content: 'x' })]
    const open = run(frames.slice(0, -1))

    expect(open.paths).toEqual([])
    expect(run([frames[frames.length - 1]], open.state).paths).toEqual(['a.md'])
  })

  it('names nothing for a write whose path never finished arriving', () => {
    const { paths } = run([messageStart('m1'), toolStart(1, 'Write', 't'), jsonDelta(1, '{"file_path":"a.'), stop(1)])

    expect(paths).toEqual([])
  })

  it('leaves out .memlog.md, a path outside the project, an empty path and a tool that is not a write', () => {
    const { paths } = run([
      messageStart('m1'),
      ...write('Write', { file_path: `${ROOT}/_bmad/.memlog.md`, content: 'note' }, 7, 1),
      ...write('Write', { file_path: '/etc/passwd', content: 'x' }, 7, 2),
      ...write('Write', { file_path: '../elsewhere.md', content: 'x' }, 7, 3),
      ...write('Write', { file_path: '', content: 'x' }, 7, 4),
      ...write('Read', { file_path: `${ROOT}/read.md` }, 7, 5),
      ...write('Bash', { command: 'echo > a.md' }, 7, 6),
      ...write('constructor', { file_path: `${ROOT}/c.md` }, 7, 7)
    ])

    expect(paths).toEqual([])
  })

  it('ignores a frame attributed to a subagent, whose block indexes are not the main thread’s', () => {
    const { paths } = run([
      messageStart('m1'),
      ...write('Write', { file_path: `${ROOT}/sub.md`, content: 'x' }, 7, 1, { parent: 'toolu_9' })
    ])

    expect(paths).toEqual([])
  })

  it('keeps writes in different blocks of one message apart', () => {
    const one = fragments({ file_path: `${ROOT}/one.md`, content: 'a' }, 4)
    const two = fragments({ file_path: `${ROOT}/two.md`, content: 'b' }, 4)
    const frames: unknown[] = [messageStart('m1'), toolStart(1, 'Write', 'a'), toolStart(2, 'Edit', 'b')]
    for (let at = 0; at < Math.max(one.length, two.length); at += 1) {
      if (one[at] !== undefined) frames.push(jsonDelta(1, one[at]))
      if (two[at] !== undefined) frames.push(jsonDelta(2, two[at]))
    }
    frames.push(stop(2), stop(1))

    expect(run(frames).paths).toEqual(['two.md', 'one.md'])
  })

  it('forgets an unfinished write when the next message begins, and never throws on a frame it does not know', () => {
    const begun = run([messageStart('m1'), toolStart(1, 'Write', 't'), jsonDelta(1, '{"file_')])
    const next = run([messageStart('m2'), { type: 'result' }, null, 'x', stop(1)], begun.state)

    expect(next.paths).toEqual([])
    expect(next.state).toEqual(initialWrittenState)
  })

  it('leaves the state it was given as it was', () => {
    const begun = run([messageStart('m1'), toolStart(1, 'Write', 't'), jsonDelta(1, '{"file_path":"a')])
    const frozen = JSON.stringify(begun.state)
    run([jsonDelta(1, '.md","content":"x"}'), stop(1)], begun.state)

    expect(JSON.stringify(begun.state)).toBe(frozen)
  })
})

describe('withWrittenPaths', () => {
  it('keeps write order and names each file once, never sorting', () => {
    const first = withWrittenPaths([], ['b.md', 'a.md'])
    const second = withWrittenPaths(first, ['c.md', 'b.md', 'a.md', 'd.md', 'd.md'])

    expect(first).toEqual(['b.md', 'a.md'])
    expect(second).toEqual(['b.md', 'a.md', 'c.md', 'd.md'])
  })

  it('returns the list it was given when nothing is new', () => {
    const list = ['a.md']

    expect(withWrittenPaths(list, ['a.md'])).toBe(list)
    expect(withWrittenPaths(list, [])).toBe(list)
  })
})
