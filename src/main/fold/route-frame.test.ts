import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ContractEvent } from '../../shared/events'
import { initialRouteState, routeFrame, withoutPendingWrites } from './route-frame'
import type { RouteContext, RouteState } from './route-frame'

const ROOT = '/work/project'
const CTX: RouteContext = {
  sessionId: 's1',
  agentId: 'bmad-agent-pm',
  runId: 'r1',
  projectRoot: ROOT,
  now: 1_700_000_000_000
}

type Parent = { parent?: string | null }

const stream = (event: unknown, { parent = null }: Parent = {}) => ({
  type: 'stream_event',
  event,
  parent_tool_use_id: parent
})
const messageStart = (id: string, p?: Parent) => stream({ type: 'message_start', message: { id } }, p)
const textStart = (index: number, p?: Parent) =>
  stream({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } }, p)
const toolStart = (index: number, name: string, id: string, p?: Parent) =>
  stream({ type: 'content_block_start', index, content_block: { type: 'tool_use', id, name, input: {} } }, p)
const textDelta = (index: number, text: string, p?: Parent) =>
  stream({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } }, p)
const jsonDelta = (index: number, partial: string, p?: Parent) =>
  stream({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: partial } }, p)
const stop = (index: number, p?: Parent) => stream({ type: 'content_block_stop', index }, p)

/** A tool input as the CLI streams it: one JSON text in fragments of `size`. */
function inputFragments(input: Record<string, unknown>, size: number): string[] {
  const json = JSON.stringify(input)
  const pieces: string[] = ['']
  for (let at = 0; at < json.length; at += size) pieces.push(json.slice(at, at + size))
  return pieces
}

function run(frames: unknown[], ctx: RouteContext = CTX, from: RouteState = initialRouteState) {
  let state = from
  const events: ContractEvent[] = []
  for (const frame of frames) {
    const routed = routeFrame(state, frame, ctx)
    state = routed.state
    events.push(...routed.events)
  }
  return { state, events }
}

function writeFrames(name: string, input: Record<string, unknown>, size: number, index = 1) {
  return [
    messageStart('msg_1'),
    toolStart(index, name, 'toolu_1'),
    ...inputFragments(input, size).map((piece) => jsonDelta(index, piece)),
    stop(index)
  ]
}

const toolResult = (id: string, isError?: boolean, p: Parent = {}) => ({
  type: 'user',
  parent_tool_use_id: p.parent ?? null,
  message: {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: id, content: 'done', ...(isError === undefined ? {} : { is_error: isError }) }]
  }
})

const names = (events: ContractEvent[]) => events.map((event) => event.name)
const proseText = (events: ContractEvent[]) =>
  events.flatMap((event) => (event.name === 'doc:prose' ? [event.payload.text] : [])).join('')

const BODY = '# Title\n\nCafé "quoted" \\ path \u{1f600} line\n\tindented\n' + 'x'.repeat(300)

describe('routeFrame', () => {
  it('turns main-thread speech into persona:said', () => {
    const { events } = run([messageStart('msg_9'), textStart(0), textDelta(0, 'Hello'), textDelta(0, ' there')])
    expect(events).toEqual([
      {
        name: 'persona:said',
        payload: { sessionId: 's1', agentId: 'bmad-agent-pm', messageId: 'msg_9', text: 'Hello', at: CTX.now }
      },
      {
        name: 'persona:said',
        payload: { sessionId: 's1', agentId: 'bmad-agent-pm', messageId: 'msg_9', text: ' there', at: CTX.now }
      }
    ])
  })

  it('treats a frame with no parent_tool_use_id key at all as the main thread', () => {
    const bare = {
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } }
    }
    expect(names(run([messageStart('m'), textStart(0), bare]).events)).toEqual(['persona:said'])
  })

  it('leaves agentId off for a session that has none', () => {
    const { events } = run([messageStart('m'), textStart(0), textDelta(0, 'hi')], { ...CTX, agentId: undefined })
    expect(events[0].payload).not.toHaveProperty('agentId')
  })

  it('says nothing for the complete message that repeats what already streamed', () => {
    const complete = {
      type: 'assistant',
      message: { id: 'msg_1', content: [{ type: 'text', text: 'Hello' }] },
      parent_tool_use_id: null
    }
    const { events } = run([messageStart('msg_1'), textStart(0), textDelta(0, 'Hello'), stop(0), complete])
    expect(names(events)).toEqual(['persona:said'])
  })

  it('routes a document write as doc:prose that reassembles to the content', () => {
    const input = { file_path: `${ROOT}/_bmad/x/prd.md`, content: BODY }
    const { events } = run(writeFrames('Write', input, 7))
    expect(new Set(names(events))).toEqual(new Set(['doc:prose']))
    expect(proseText(events)).toBe(BODY)
    expect(events.length).toBeGreaterThan(1)
    expect(events[0]).toEqual({
      name: 'doc:prose',
      payload: expect.objectContaining({
        runId: 'r1',
        sessionId: 's1',
        callId: 'toolu_1',
        path: '_bmad/x/prd.md',
        at: CTX.now
      })
    })
  })

  it('routes the new text of an Edit as doc:prose and ignores the old', () => {
    const input = { file_path: `${ROOT}/_bmad/x/prd.md`, old_string: 'OLD TEXT', new_string: 'new text', replace_all: false }
    const { events } = run(writeFrames('Edit', input, 5))
    expect(proseText(events)).toBe('new text')
    expect(names(events).every((name) => name === 'doc:prose')).toBe(true)
  })

  it('routes a memlog write nowhere: no prose, no note, and nothing pending to commit', () => {
    const input = { file_path: `${ROOT}/_bmad/x/.memlog.md`, content: '- (event) found a thing\n' }
    const { events, state } = run([...writeFrames('Write', input, 6), toolResult('toolu_1')])
    expect(events).toEqual([])
    expect(state.writes).toEqual({})
  })

  it('holds content that precedes file_path until the path is known, losing and repeating nothing', () => {
    const input = { content: BODY, file_path: `${ROOT}/_bmad/x/prd.md` }
    for (const size of [1, 3, 11, 500]) {
      const { events } = run(writeFrames('Write', input, size))
      expect(proseText(events)).toBe(BODY)
      expect(events.every((event) => event.name === 'doc:prose' && event.payload.path === '_bmad/x/prd.md')).toBe(true)
    }
  })

  it('drops a memlog write whose path arrives last, having held it', () => {
    const input = { content: 'late path', file_path: `${ROOT}/.memlog.md` }
    const { events } = run(writeFrames('Write', input, 4))
    expect(events).toEqual([])
  })

  it('decodes an escape or a surrogate pair split across fragments whole', () => {
    const wire = '{"file_path": "' + ROOT + '/a.md", "content": "x\\ud83d\\ude00\\u00e9\\n"}'
    for (let at = 1; at < wire.length; at += 1) {
      const { events } = run([
        messageStart('m'),
        toolStart(1, 'Write', 't'),
        jsonDelta(1, wire.slice(0, at)),
        jsonDelta(1, wire.slice(at)),
        stop(1)
      ])
      expect(proseText(events)).toBe('x\u{1f600}é\n')
      for (const event of events) {
        if (event.name === 'doc:prose') expect(event.payload.text).not.toMatch(/\p{Surrogate}/u)
      }
    }
  })

  it('emits nothing when the block closes without a file_path', () => {
    const { events } = run([
      messageStart('m'),
      toolStart(1, 'Write', 't'),
      jsonDelta(1, '{"content": "orphan'),
      jsonDelta(1, ' text"}'),
      stop(1)
    ])
    expect(events).toEqual([])
  })

  it('ignores a subagent frame and leaves the fold state untouched', () => {
    const subagent = { parent: 'toolu_agent' }
    const main = [messageStart('msg_main'), textStart(0), textDelta(0, 'main one ')]
    const before = run(main)
    const frames = [
      messageStart('msg_sub', subagent),
      textStart(0, subagent),
      textDelta(0, 'SUB', subagent),
      toolStart(1, 'Write', 'sub_tool', subagent),
      jsonDelta(1, '{"file_path": "/work/project/a.md", "content": "sub"}', subagent),
      stop(0, subagent)
    ]
    for (const frame of frames) {
      const routed = routeFrame(before.state, frame, CTX)
      expect(routed.events).toEqual([])
      expect(routed.state).toBe(before.state)
    }
  })

  it('keeps the main thread uncorrupted when subagent blocks collide with its indexes', () => {
    const sub = { parent: 'toolu_agent' }
    const { events } = run([
      messageStart('msg_main'),
      textStart(0),
      textDelta(0, 'one '),
      messageStart('msg_sub', sub),
      textStart(0, sub),
      textDelta(0, 'SUBAGENT', sub),
      stop(0, sub),
      textDelta(0, 'two')
    ])
    expect(events.map((event) => ('text' in event.payload ? event.payload.text : ''))).toEqual(['one ', 'two'])
    expect(events.every((event) => event.name === 'persona:said' && event.payload.messageId === 'msg_main')).toBe(true)
  })

  it('raises no document or note event for a chat turn with no run', () => {
    const input = { file_path: `${ROOT}/_bmad/x/prd.md`, content: 'x' }
    expect(run(writeFrames('Write', input, 4), { ...CTX, runId: undefined }).events).toEqual([])
    const note = { file_path: `${ROOT}/.memlog.md`, content: 'x' }
    expect(run(writeFrames('Write', note, 4), { ...CTX, runId: undefined }).events).toEqual([])
  })

  it('raises nothing for a path outside the project', () => {
    for (const file_path of ['/elsewhere/prd.md', `${ROOT}/../other/prd.md`, '/work/project-two/a.md', ROOT]) {
      expect(run(writeFrames('Write', { file_path, content: 'x' }, 4)).events).toEqual([])
    }
    expect(run(writeFrames('Write', { file_path: '/elsewhere/.memlog.md', content: 'x' }, 4)).events).toEqual([])
  })

  it('resolves a relative path against the project root', () => {
    const { events } = run(writeFrames('Write', { file_path: '_bmad/a/../b.md', content: 'x' }, 4))
    expect(events[0].payload).toEqual(expect.objectContaining({ path: '_bmad/b.md' }))
  })

  it('ignores other tools, thinking and malformed frames, and keeps working', () => {
    const frames: unknown[] = [
      messageStart('m'),
      toolStart(0, 'Bash', 'b'),
      jsonDelta(0, '{"command": "cat > /work/project/a.md <<EOF"}'),
      stop(0),
      toolStart(1, 'Read', 'r'),
      jsonDelta(1, '{"file_path": "/work/project/a.md", "content": "x"}'),
      stop(1),
      stream({ type: 'content_block_start', index: 2, content_block: { type: 'thinking', thinking: '' } }),
      stream({ type: 'content_block_delta', index: 2, delta: { type: 'thinking_delta', thinking: 'hmm' } }),
      stop(2),
      null,
      'text',
      42,
      [],
      {},
      { type: 'unknown' },
      { type: 'stream_event' },
      { type: 'stream_event', event: 'nope' },
      stream({ type: 'content_block_delta', index: 'x', delta: {} }),
      stream({ type: 'content_block_delta', index: 0, delta: null }),
      { type: 'system', subtype: 'task_progress' }
    ]
    const { events, state } = run(frames)
    expect(events).toEqual([])
    const after = run([messageStart('m2'), textStart(0), textDelta(0, 'still works')], CTX, state)
    expect(names(after.events)).toEqual(['persona:said'])
  })

  it('does not say a thinking block as persona speech even when a text_delta names its index', () => {
    const { events } = run([
      messageStart('m'),
      stream({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }),
      textDelta(0, 'never')
    ])
    expect(events).toEqual([])
  })

  it('drops a text delta with no open block, in the first message and after a new one resets the blocks', () => {
    expect(run([messageStart('m'), textDelta(0, 'stray')]).events).toEqual([])
    expect(run([textDelta(0, 'before any message')]).events).toEqual([])
    const reset = run([messageStart('m1'), textStart(0), stop(0), textDelta(0, 'after the block closed')])
    expect(reset.events).toEqual([])
    const renewed = run([messageStart('m1'), textStart(0), messageStart('m2'), textDelta(0, 'no block in m2')])
    expect(renewed.events).toEqual([])
  })

  it('gives a message with no id an id of its own, so two such messages are never one', () => {
    const noId = stream({ type: 'message_start', message: {} })
    const noMessage = stream({ type: 'message_start' })
    const { events } = run([
      noId,
      textStart(0),
      textDelta(0, 'one'),
      noMessage,
      textStart(0),
      textDelta(0, 'two')
    ])
    const ids = events.map((event) => (event.name === 'persona:said' ? event.payload.messageId : ''))

    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe('')
    expect(ids[1]).not.toBe('')
    expect(ids[0]).not.toBe(ids[1])
    // Made from the session, so another session's cannot join this one's.
    const elsewhere = run([noId, textStart(0), textDelta(0, 'x')], { ...CTX, sessionId: 's2' }).events[0]
    expect(elsewhere.name === 'persona:said' && elsewhere.payload.messageId).not.toBe(ids[0])
  })

  it('keeps a real message id as it is', () => {
    const { events } = run([messageStart('msg_real'), textStart(0), textDelta(0, 'x')])

    expect(events[0].name === 'persona:said' && events[0].payload.messageId).toBe('msg_real')
  })

  it('yields no event and no state change for a result or a background-task frame', () => {
    const start = run([messageStart('m')]).state
    for (const frame of [
      { type: 'result', subtype: 'success', is_error: false },
      { type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'a' }] }
    ]) {
      expect(routeFrame(start, frame, CTX)).toEqual({ state: start, events: [] })
    }
  })

  it('resets block bookkeeping at each new message', () => {
    const { events } = run([
      messageStart('m1'),
      toolStart(1, 'Write', 't'),
      jsonDelta(1, '{"file_path": "/work/project/a.md", "content": "a'),
      messageStart('m2'),
      jsonDelta(1, 'bc"}')
    ])
    expect(proseText(events)).toBe('a')
  })

  it('does not mutate the state it was handed', () => {
    const start = run([messageStart('m'), toolStart(1, 'Write', 't')]).state
    const snapshot = structuredClone(start)
    routeFrame(start, jsonDelta(1, '{"file_path": "/work/project/a.md", "content": "x"}'), CTX)
    expect(start).toEqual(snapshot)
  })

  it('gives the same events when the same frames are folded twice from fresh state', () => {
    const frames = [
      messageStart('m'),
      textStart(0),
      textDelta(0, 'hi'),
      stop(0),
      ...writeFrames('Write', { content: BODY, file_path: `${ROOT}/_bmad/x/prd.md` }, 9)
    ]
    expect(run(frames).events).toEqual(run(frames).events)
  })
})

describe('routeFrame: a write commits on its tool_result (AD-5)', () => {
  const DOC = ['# PRD', '', '## **Vision**', 'text', '```', '## not a section', '```', '## Scope ##', '### Detail'].join('\n')
  const input = { file_path: `${ROOT}/_bmad/x/prd.md`, content: DOC }

  it('raises exactly one doc:committed, with the level-2 headings of what was written, after the prose', () => {
    const { events, state } = run([...writeFrames('Write', input, 9), toolResult('toolu_1'), toolResult('toolu_1')])
    const commits = events.filter((event) => event.name === 'doc:committed')
    expect(commits).toEqual([
      {
        name: 'doc:committed',
        payload: {
          ok: true,
          runId: 'r1',
          sessionId: 's1',
          callId: 'toolu_1',
          path: '_bmad/x/prd.md',
          sections: ['Vision', 'Scope'],
          at: CTX.now
        }
      }
    ])
    expect(names(events).at(-1)).toBe('doc:committed')
    expect(state.writes).toEqual({})
  })

  it('commits the headings of text held before its file_path closed, at every fragment size', () => {
    const late = { content: DOC, file_path: `${ROOT}/_bmad/x/prd.md` }
    for (const size of [1, 4, 13, 500]) {
      const { events, state } = run([...writeFrames('Write', late, size), toolResult('toolu_1')])
      const commits = events.filter((event) => event.name === 'doc:committed')
      expect(commits, `size ${size}`).toHaveLength(1)
      expect(commits[0].name === 'doc:committed' && commits[0].payload.ok && commits[0].payload.sections, `size ${size}`).toEqual([
        'Vision',
        'Scope'
      ])
      expect(state.writes).toEqual({})
    }
  })

  it('commits an Edit with the headings of its new text', () => {
    const edit = { file_path: `${ROOT}/_bmad/x/prd.md`, old_string: '## Old', new_string: '## New\nbody' }
    const commit = run([...writeFrames('Edit', edit, 4), toolResult('toolu_1')]).events.at(-1)
    expect(commit?.name === 'doc:committed' && commit.payload.ok && commit.payload.sections).toEqual(['New'])
  })

  it('commits a rejected write as the envelope, naming no section', () => {
    const commit = run([...writeFrames('Write', input, 9), toolResult('toolu_1', true)]).events.at(-1)
    expect(commit).toEqual({
      name: 'doc:committed',
      payload: {
        ok: false,
        runId: 'r1',
        sessionId: 's1',
        callId: 'toolu_1',
        path: '_bmad/x/prd.md',
        error: { code: 'doc/write-rejected', message: 'doc · the write was rejected' },
        at: CTX.now
      }
    })
  })

  it('holds the write across a new message, and commits nothing for a result it was not waiting on', () => {
    const { events } = run([...writeFrames('Write', input, 50), messageStart('msg_2'), toolResult('toolu_other'), toolResult('toolu_1')])
    expect(names(events).filter((name) => name === 'doc:committed')).toHaveLength(1)
  })

  it('commits nothing for a write that never came back, once its pending writes are dropped', () => {
    const streamed = run(writeFrames('Write', input, 9))
    expect(Object.keys(streamed.state.writes)).toEqual(['toolu_1'])
    const dropped = withoutPendingWrites(streamed.state)
    expect(dropped.writes).toEqual({})
    expect(run([toolResult('toolu_1')], CTX, dropped).events).toEqual([])
    expect(withoutPendingWrites(dropped)).toBe(dropped)
  })

  it('commits nothing outside the project, for a subagent, or with no run', () => {
    const outside = { file_path: '/elsewhere/prd.md', content: DOC }
    expect(run([...writeFrames('Write', outside, 9), toolResult('toolu_1')]).events).toEqual([])
    const streamed = run(writeFrames('Write', input, 9))
    expect(routeFrame(streamed.state, toolResult('toolu_1', false, { parent: 'toolu_agent' }), CTX).events).toEqual([])
    expect(run([...writeFrames('Write', input, 9), toolResult('toolu_1')], { ...CTX, runId: undefined }).events).toEqual([])
  })
})

describe('routeFrame against the recorded corpus', () => {
  const FIXTURE = resolve(import.meta.dirname, '..', '..', '..', 'fixtures', 'runs', 'fast-path-sonnet.jsonl')
  const frames: Record<string, unknown>[] = readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>)

  type ToolUse = { type: string; id?: string; name?: string; input?: Record<string, unknown> }
  const mainTools = frames.flatMap((frame) => {
    if (frame.type !== 'assistant' || frame.parent_tool_use_id) return []
    const message = frame.message as { content?: ToolUse[] }
    return (message.content ?? []).filter((block) => block.type === 'tool_use')
  })
  const firstWrite = mainTools.find((tool) => tool.name === 'Write')
  const root = String(firstWrite?.input?.file_path).split('/_bmad/')[0]
  const ctx: RouteContext = { ...CTX, projectRoot: root }

  it('yields no event from any frame carrying a parent_tool_use_id, and never changes state', () => {
    let state = initialRouteState
    let seen = 0
    for (const frame of frames) {
      const routed = routeFrame(state, frame, ctx)
      if (frame.parent_tool_use_id) {
        seen += 1
        expect(routed.events).toEqual([])
        expect(routed.state).toBe(state)
      }
      state = routed.state
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('reassembles the prose of every Write and Edit to exactly what the tool finally wrote', () => {
    const events = run(frames, ctx).events
    const byCall = new Map<string, string>()
    for (const event of events) {
      if (event.name === 'doc:prose') {
        byCall.set(event.payload.callId, (byCall.get(event.payload.callId) ?? '') + event.payload.text)
      }
    }
    const writes = mainTools.filter((tool) => tool.name === 'Write' || tool.name === 'Edit')
    expect(writes.length).toBeGreaterThan(1)
    for (const tool of writes) {
      const expected = String(tool.name === 'Write' ? tool.input?.content : tool.input?.new_string)
      expect(byCall.get(tool.id ?? '') ?? '').toBe(expected)
    }
  })

  it('commits every Write and Edit exactly once, on its tool_result, and the big Write names its sections', () => {
    const events = run(frames, ctx).events
    const writes = mainTools.filter((tool) => tool.name === 'Write' || tool.name === 'Edit')
    const commits = events.flatMap((event) => (event.name === 'doc:committed' ? [event.payload] : []))
    expect(commits.map((commit) => commit.callId).sort()).toEqual(writes.map((tool) => tool.id ?? '').sort())
    const big = writes.find((tool) => tool.name === 'Write' && String(tool.input?.content).length > 40_000)
    const bigCommit = commits.find((commit) => commit.callId === big?.id)
    expect(bigCommit?.ok).toBe(true)
    expect(bigCommit?.ok === true && bigCommit.sections.length).toBeGreaterThan(5)
    // Committed after the last piece of its prose.
    const lastProse = events.findLastIndex((event) => event.name === 'doc:prose' && event.payload.callId === big?.id)
    expect(events.findIndex((event) => event.name === 'doc:committed' && event.payload.callId === big?.id)).toBeGreaterThan(lastProse)
  })

  it('says the same words once: every persona:said text is a text_delta of the main thread', () => {
    const said = run(frames, ctx).events.filter((event) => event.name === 'persona:said')
    const deltas = frames.flatMap((frame) => {
      const event = frame.event as { delta?: { type?: string; text?: string } } | undefined
      return frame.type === 'stream_event' && !frame.parent_tool_use_id && event?.delta?.type === 'text_delta'
        ? [event.delta.text ?? '']
        : []
    })
    expect(said.map((event) => event.payload.text)).toEqual(deltas.filter((text) => text !== ''))
  })
})
