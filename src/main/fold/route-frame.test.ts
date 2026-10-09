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
/** The events that are not a step's: the document and note events these older cases are about. */
const withoutSteps = (events: ContractEvent[]) => events.filter((event) => event.name !== 'run:step')
const steps = (events: ContractEvent[]) => events.flatMap((event) => (event.name === 'run:step' ? [event.payload] : []))
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

  it('says nothing for the speech of a session that has no persona and no marker', () => {
    const { events } = run([messageStart('m'), textStart(0), textDelta(0, 'hi'), stop(0)], { ...CTX, agentId: undefined })
    expect(events).toEqual([])
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
    const { events: all } = run(writeFrames('Write', input, 7))
    const events = withoutSteps(all)
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

  it('streams nothing for an Edit, holding its old and new text whole until its result', () => {
    const input = { file_path: `${ROOT}/_bmad/x/prd.md`, old_string: 'OLD TEXT', new_string: 'new text', replace_all: false }
    for (const size of [1, 5, 500]) {
      const { events, state } = run(writeFrames('Edit', input, size))
      expect(withoutSteps(events), `size ${size}`).toEqual([])
      expect(state.writes.toolu_1, `size ${size}`).toEqual({ path: '_bmad/x/prd.md', tool: 'Edit', text: 'new text', old: 'OLD TEXT' })
    }
  })

  it('holds each Write as the run’s buffer of its path, as it streams, and a chat turn holds none', () => {
    const streamed = run(writeFrames('Write', { file_path: `${ROOT}/_bmad/x/prd.md`, content: BODY }, 7))
    expect(streamed.state.docs).toEqual({ '_bmad/x/prd.md': BODY })
    const half = run(writeFrames('Write', { file_path: `${ROOT}/_bmad/x/prd.md`, content: BODY }, 7).slice(0, 6))
    expect(BODY.startsWith(half.state.docs['_bmad/x/prd.md'] ?? '')).toBe(true)
    expect(run(writeFrames('Write', { file_path: `${ROOT}/a.md`, content: 'x' }, 4), { ...CTX, runId: undefined }).state.docs).toEqual({})
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
      const events = withoutSteps(run(writeFrames('Write', input, size)).events)
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
    // The call still happened: its step names the verb alone, since no path ever arrived.
    expect(withoutSteps(events)).toEqual([])
    expect(steps(events)).toEqual([expect.objectContaining({ status: 'running', callId: 't', label: 'write' })])
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
      // No document event; the call is a step, labelled by its basename only.
      const { events } = run(writeFrames('Write', { file_path, content: 'x' }, 4))
      expect(withoutSteps(events)).toEqual([])
      expect(steps(events).map((step) => ('label' in step ? step.label : ''))).toEqual([
        file_path === ROOT ? 'write project' : `write ${file_path.split('/').at(-1)}`
      ])
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
    // The two tools are steps (the call is whole at its stop); nothing else is said.
    expect(events.map((event) => event.name)).toEqual(['run:step', 'run:step'])
    expect(steps(events).map((step) => ('label' in step ? step.label : ''))).toEqual(['run cat', 'read a.md'])
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
    const { events: all, state } = run([...writeFrames('Write', input, 9), toolResult('toolu_1'), toolResult('toolu_1')])
    const events = withoutSteps(all)
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
      const { events: all, state } = run([...writeFrames('Write', late, size), toolResult('toolu_1')])
      const events = withoutSteps(all)
      const commits = events.filter((event) => event.name === 'doc:committed')
      expect(commits, `size ${size}`).toHaveLength(1)
      expect(commits[0].name === 'doc:committed' && commits[0].payload.ok && commits[0].payload.sections, `size ${size}`).toEqual([
        'Vision',
        'Scope'
      ])
      expect(state.writes).toEqual({})
    }
  })

  /** A Write of `text` to prd.md, its result, then an Edit (`toolu_2`) whose result is `failed`. */
  function writeThenEdit(text: string, edit: Record<string, unknown>, failed?: boolean) {
    const write = run([...writeFrames('Write', { file_path: `${ROOT}/_bmad/x/prd.md`, content: text }, 9), toolResult('toolu_1')])
    const frames = [messageStart('msg_2'), toolStart(1, 'Edit', 'toolu_2'), ...inputFragments(edit, 4).map((piece) => jsonDelta(1, piece)), stop(1), toolResult('toolu_2', failed)]
    return run(frames, CTX, write.state)
  }

  it('patches the run’s buffer with an Edit that applied, and commits the whole document and its sections', () => {
    const edit = { file_path: `${ROOT}/_bmad/x/prd.md`, old_string: '## **Vision**\ntext', new_string: '## Vision\nnew $& text\n## Goals' }
    const { events: all, state } = writeThenEdit(DOC, edit)
    const events = withoutSteps(all)
    const patched = DOC.replace('## **Vision**\ntext', () => '## Vision\nnew $& text\n## Goals')
    expect(events).toEqual([
      {
        name: 'doc:committed',
        payload: { ok: true, runId: 'r1', sessionId: 's1', callId: 'toolu_2', path: '_bmad/x/prd.md', sections: ['Vision', 'Goals', 'Scope'], text: patched, at: CTX.now }
      }
    ])
    expect(state.docs['_bmad/x/prd.md']).toBe(patched)
  })

  it('replaces every occurrence, as an Edit with replace_all did', () => {
    const events = withoutSteps(writeThenEdit('a x a x a', { file_path: `${ROOT}/_bmad/x/prd.md`, old_string: 'x', new_string: 'yy', replace_all: true }).events)
    expect(events[0]?.name === 'doc:committed' && events[0].payload.ok && events[0].payload.text).toBe('a yy a yy a')
  })

  it('changes no buffer and sends no text for an Edit whose old text is absent or empty, or that was rejected', () => {
    for (const [edit, failed] of [
      [{ file_path: `${ROOT}/_bmad/x/prd.md`, old_string: 'not there', new_string: '## Never' }, false],
      [{ file_path: `${ROOT}/_bmad/x/prd.md`, old_string: '', new_string: '## Never' }, false],
      [{ file_path: `${ROOT}/_bmad/x/prd.md`, new_string: '## Never' }, false],
      [{ file_path: `${ROOT}/_bmad/x/prd.md`, old_string: 'text', new_string: '## Never' }, true]
    ] as const) {
      const { events, state } = writeThenEdit(DOC, edit, failed)
      expect(state.docs['_bmad/x/prd.md']).toBe(DOC)
      const commit = withoutSteps(events)[0]
      expect(commit?.name).toBe('doc:committed')
      if (commit?.name === 'doc:committed' && commit.payload.ok) {
        expect(commit.payload).not.toHaveProperty('text')
        expect(commit.payload.sections).toEqual(['Vision', 'Scope'])
      } else {
        expect(failed).toBe(true)
      }
    }
  })

  it('commits an Edit of a path no Write of this run started with no sections and no text, and keeps no buffer for it', () => {
    const edit = { file_path: `${ROOT}/_bmad/x/other.md`, old_string: '## Old', new_string: '## New\nbody' }
    const { events, state } = run([...writeFrames('Edit', edit, 4), toolResult('toolu_1')])
    const commit = withoutSteps(events).at(-1)
    expect(commit?.name === 'doc:committed' && commit.payload.ok && commit.payload).toEqual(
      expect.objectContaining({ path: '_bmad/x/other.md', sections: [] })
    )
    expect(commit?.payload).not.toHaveProperty('text')
    expect(state.docs).toEqual({})
  })

  it('patches only the buffer of the path the Edit names', () => {
    const write = run([...writeFrames('Write', { file_path: `${ROOT}/a.md`, content: 'alpha' }, 9), toolResult('toolu_1')])
    const second = run(
      [messageStart('m2'), toolStart(1, 'Write', 'toolu_2'), jsonDelta(1, JSON.stringify({ file_path: `${ROOT}/b.md`, content: 'alpha' })), stop(1), toolResult('toolu_2')],
      CTX,
      write.state
    )
    const edit = run(
      [messageStart('m3'), toolStart(1, 'Edit', 'toolu_3'), jsonDelta(1, JSON.stringify({ file_path: `${ROOT}/b.md`, old_string: 'alpha', new_string: 'beta' })), stop(1), toolResult('toolu_3')],
      CTX,
      second.state
    )
    expect(edit.state.docs).toEqual({ 'a.md': 'alpha', 'b.md': 'beta' })
  })

  it('commits a rejected write as the envelope, naming no section', () => {
    const commit = withoutSteps(run([...writeFrames('Write', input, 9), toolResult('toolu_1', true)]).events).at(-1)
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

  it('commits nothing for a write that never came back, once its pending writes are dropped, and drops the buffers', () => {
    const streamed = run(writeFrames('Write', input, 9))
    expect(Object.keys(streamed.state.writes)).toEqual(['toolu_1'])
    const dropped = withoutPendingWrites(streamed.state)
    expect(dropped.writes).toEqual({})
    expect(dropped.docs).toEqual({})
    expect(run([toolResult('toolu_1')], CTX, dropped).events).toEqual([])
    expect(dropped.steps).toEqual({})
    expect(withoutPendingWrites(dropped)).toBe(dropped)
  })

  it('commits nothing outside the project, for a subagent, or with no run', () => {
    const outside = { file_path: '/elsewhere/prd.md', content: DOC }
    expect(withoutSteps(run([...writeFrames('Write', outside, 9), toolResult('toolu_1')]).events)).toEqual([])
    const streamed = run(writeFrames('Write', input, 9))
    expect(routeFrame(streamed.state, toolResult('toolu_1', false, { parent: 'toolu_agent' }), CTX).events).toEqual([])
    expect(run([...writeFrames('Write', input, 9), toolResult('toolu_1')], { ...CTX, runId: undefined }).events).toEqual([])
  })
})

describe('routeFrame: a run’s tool steps (AD-22)', () => {
  const step = (events: ContractEvent[]) => steps(events).map((each) => [each.callId, each.status, 'label' in each ? each.label : undefined])

  it('raises running when the input is whole, at the block stop and not before, then done on the result', () => {
    const frames = [messageStart('m'), toolStart(1, 'Read', 'toolu_r'), ...inputFragments({ file_path: `${ROOT}/design/tokens.css` }, 5).map((p) => jsonDelta(1, p))]
    const open = run(frames)
    expect(open.events).toEqual([])
    const stopped = run([stop(1)], { ...CTX, now: 5 }, open.state)
    expect(stopped.events).toEqual([
      { name: 'run:step', payload: { runId: 'r1', sessionId: 's1', callId: 'toolu_r', status: 'running', label: 'read design/tokens.css', at: 5 } }
    ])
    const done = run([toolResult('toolu_r')], { ...CTX, now: 9 }, stopped.state)
    expect(done.events).toEqual([
      { name: 'run:step', payload: { runId: 'r1', sessionId: 's1', callId: 'toolu_r', status: 'done', at: 9 } }
    ])
    expect(done.state.steps).toEqual({})
  })

  it('raises failed for a result the CLI marked as an error, and nothing for a second result of the same call', () => {
    const { events } = run([...writeFrames('Read', { file_path: `${ROOT}/a.md` }, 6), toolResult('toolu_1', true), toolResult('toolu_1')])
    expect(step(events)).toEqual([['toolu_1', 'running', 'read a.md'], ['toolu_1', 'failed', undefined]])
  })

  it('raises exactly one running per call, at every fragment size, with the field anywhere in the input', () => {
    const input = { description: 'x'.repeat(200), nested: { file_path: '/never/used.md' }, file_path: `${ROOT}/src/a.ts`, other: [1, 2, 3] }
    for (const size of [1, 2, 7, 64, 5_000]) {
      const { events } = run(writeFrames('Read', input, size))
      expect(step(events), `size ${size}`).toEqual([['toolu_1', 'running', 'read src/a.ts']])
    }
  })

  it('has the label be the verb alone when the field never arrives, and when it outgrows the bounded buffer', () => {
    expect(step(run(writeFrames('Read', { limit: 5 }, 4)).events)).toEqual([['toolu_1', 'running', 'read']])
    const over = run(writeFrames('Read', { file_path: `${ROOT}/${'d/'.repeat(600)}a.md` }, 50))
    expect(step(over.events)).toEqual([['toolu_1', 'running', 'read']])
    // Open and cut off mid-field: not whole, so not named.
    const cut = run([messageStart('m'), toolStart(1, 'Read', 't'), jsonDelta(1, '{"file_path": "/work/project/a'), stop(1)])
    expect(step(cut.events)).toEqual([['t', 'running', 'read']])
  })

  it('reads the program of a Bash command longer than the buffer, and keeps none of the rest', () => {
    const command = `cat <<EOF\n${'LATER-PART-SECRET '.repeat(400)}\nEOF`
    expect(command.length).toBeGreaterThan(5_000)
    for (const size of [7, 300, 10_000]) {
      const { events, state } = run(writeFrames('Bash', { command: `cat <<EOF\n${'x'.repeat(3_000)}LATER-PART${command}`, description: 'd' }, size))
      expect(step(events), `size ${size}`).toEqual([['toolu_1', 'running', 'run cat']])
      expect(JSON.stringify(events), `size ${size}`).not.toContain('LATER-PART')
      expect(JSON.stringify(state), `size ${size}`).not.toContain('LATER-PART')
    }
  })

  it('keeps nothing of a tool’s input but the one field its label reads, and bounds that', () => {
    const open = run([
      messageStart('m'),
      toolStart(1, 'Bash', 'b'),
      jsonDelta(1, '{"description": "' + 'y'.repeat(5_000) + '", "command": "curl -H \"Authorization: Bearer sk-x\" https://h/x"'),
      jsonDelta(1, ', "timeout": 5}')
    ])
    const block = open.state.blocks[1]
    expect(block?.kind).toBe('step')
    expect(JSON.stringify(block)).not.toContain('yyyy')
    const done = run([stop(1)], CTX, open.state)
    expect(step(done.events)).toEqual([['b', 'running', 'run curl']])
    expect(JSON.stringify(done)).not.toMatch(/sk-x|https/)
  })

  it('raises a step for a document write beside its doc events, under the same call id, and its result closes both', () => {
    const { events } = run([...writeFrames('Write', { file_path: `${ROOT}/prd.md`, content: '## A\nb' }, 6), toolResult('toolu_1')])
    expect(events.map((event) => [event.name, event.payload && 'callId' in event.payload ? event.payload.callId : undefined])).toEqual([
      ...(events.filter((event) => event.name === 'doc:prose').map((): [string, string] => ['doc:prose', 'toolu_1'])),
      ['run:step', 'toolu_1'],
      ['doc:committed', 'toolu_1'],
      ['run:step', 'toolu_1']
    ])
    expect(step(events)).toEqual([['toolu_1', 'running', 'write prd.md'], ['toolu_1', 'done', undefined]])
  })

  it('has a rejected write’s commit and its failed step both come from the one result, the commit first', () => {
    const { events } = run([...writeFrames('Edit', { file_path: `${ROOT}/prd.md`, old_string: 'a', new_string: 'b' }, 6), toolResult('toolu_1', true)])
    expect(names(events).slice(-2)).toEqual(['doc:committed', 'run:step'])
    expect(events.at(-1)?.payload).toEqual(expect.objectContaining({ status: 'failed' }))
    expect(events.at(-2)?.payload).toEqual(expect.objectContaining({ ok: false }))
  })

  it('raises no step for a call aimed at the memlog, whatever the tool, nor for a call outside a run', () => {
    for (const [tool, field] of [['Write', 'file_path'], ['Edit', 'file_path'], ['Read', 'file_path'], ['NotebookEdit', 'notebook_path']] as const) {
      const input = { [field]: `${ROOT}/_bmad/x/.memlog.md`, content: 'x', old_string: 'a', new_string: 'b' }
      expect(run([...writeFrames(tool, input, 5), toolResult('toolu_1')]).events, tool).toEqual([])
    }
    expect(run([...writeFrames('Read', { file_path: `${ROOT}/a.md` }, 5), toolResult('toolu_1')], { ...CTX, runId: undefined }).events).toEqual([])
  })

  it('has a result close each of several calls issued together, in the order the result lists them', () => {
    const frames = [
      messageStart('m'),
      toolStart(1, 'Read', 'a'), jsonDelta(1, '{"file_path": "a.md"}'), stop(1),
      toolStart(2, 'Grep', 'b'), jsonDelta(2, '{"pattern": "secret query"}'), stop(2),
      {
        type: 'user',
        parent_tool_use_id: null,
        message: { content: [{ type: 'tool_result', tool_use_id: 'b' }, { type: 'tool_result', tool_use_id: 'a', is_error: true }] }
      }
    ]
    expect(step(run(frames).events)).toEqual([
      ['a', 'running', 'read a.md'],
      ['b', 'running', 'grep'],
      ['b', 'done', undefined],
      ['a', 'failed', undefined]
    ])
  })

  it('opens and closes no step for subagent frames, and the spawning call is one step', () => {
    const sub = { parent: 'toolu_agent' }
    const frames = [
      messageStart('m'),
      toolStart(1, 'Agent', 'toolu_agent'), jsonDelta(1, '{"subagent_type": "general-purpose", "prompt": "do it"}'), stop(1),
      messageStart('ms', sub), toolStart(1, 'Read', 'sub_1', sub), jsonDelta(1, '{"file_path": "x.md"}', sub), stop(1, sub),
      toolResult('sub_1', false, sub)
    ]
    const { events, state } = run(frames)
    expect(step(events)).toEqual([['toolu_agent', 'running', 'agent general-purpose']])
    expect(state.steps).toEqual({ toolu_agent: true })
  })

  it('drops the open steps when the run ends, so a late result closes nothing', () => {
    const open = run(writeFrames('Read', { file_path: `${ROOT}/a.md` }, 6))
    expect(open.state.steps).toEqual({ toolu_1: true })
    const dropped = withoutPendingWrites(open.state)
    expect(dropped.steps).toEqual({})
    expect(run([toolResult('toolu_1')], CTX, dropped).events).toEqual([])
  })

  it('raises one step for a 5,000-fragment write, not one per fragment', () => {
    const body = 'x'.repeat(5_000)
    const { events } = run(writeFrames('Write', { file_path: `${ROOT}/a.md`, content: body }, 1))
    expect(events.filter((event) => event.name === 'doc:prose').length).toBeGreaterThan(1_000)
    expect(steps(events)).toHaveLength(1)
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

  it('reassembles the prose of every Write to exactly what the tool wrote, and streams no Edit', () => {
    const events = run(frames, ctx).events
    const byCall = new Map<string, string>()
    for (const event of events) {
      if (event.name === 'doc:prose') {
        byCall.set(event.payload.callId, (byCall.get(event.payload.callId) ?? '') + event.payload.text)
      }
    }
    const writes = mainTools.filter((tool) => tool.name === 'Write')
    expect(writes.length).toBeGreaterThan(0)
    for (const tool of writes) {
      expect(byCall.get(tool.id ?? '') ?? '').toBe(String(tool.input?.content))
    }
    const edits = mainTools.filter((tool) => tool.name === 'Edit')
    expect(edits.length).toBeGreaterThan(1)
    for (const tool of edits) expect(byCall.has(tool.id ?? '')).toBe(false)
  })

  it('ends the run’s buffer of the big Write as the document its Edits made of it', () => {
    const { state } = run(frames, ctx)
    const big = mainTools.find((tool) => tool.name === 'Write' && String(tool.input?.content).length > 40_000)
    const path = String(big?.input?.file_path).slice(root.length + 1)
    let expected = String(big?.input?.content)
    for (const tool of mainTools) {
      if (tool.name !== 'Edit' || tool.input?.file_path !== big?.input?.file_path) continue
      const old = String(tool.input?.old_string)
      if (expected.includes(old)) expected = expected.split(old).join(String(tool.input?.new_string))
    }
    expect(expected).not.toBe(String(big?.input?.content))
    expect(state.docs[path]).toBe(expected)
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

describe('routeFrame in a room (Story 4.2)', () => {
  const ROOM: RouteContext = {
    sessionId: 'r',
    projectRoot: ROOT,
    now: 42,
    roster: [
      { id: 'bmad-agent-analyst', name: 'Mary' },
      { id: 'bmad-agent-pm', name: 'John' }
    ]
  }
  const said = (events: ContractEvent[]) =>
    events.flatMap((event) => (event.name === 'persona:said' ? [event.payload] : []))
  /** Each turn's words, joined, keyed by the message id they carry. */
  const turns = (events: ContractEvent[]) => {
    const joined = new Map<string, { agentId: string | undefined; text: string }>()
    for (const payload of said(events)) {
      const held = joined.get(payload.messageId)
      joined.set(payload.messageId, { agentId: payload.agentId, text: (held?.text ?? '') + payload.text })
    }
    return [...joined.entries()]
  }
  const room = (...deltas: string[]) =>
    run([messageStart('m'), textStart(0), ...deltas.map((text) => textDelta(0, text)), stop(0)], ROOM)

  it('attributes each marker’s words to its persona, as a turn of its own, with no marker text', () => {
    const { events } = room('🧙 **Mary:** Hi.\n📋 **John:** No.')
    expect(turns(events)).toEqual([
      ['m#1', { agentId: 'bmad-agent-analyst', text: 'Hi.\n' }],
      ['m#2', { agentId: 'bmad-agent-pm', text: 'No.' }]
    ])
    expect(said(events).every((payload) => payload.room === true && payload.sessionId === 'r' && payload.at === 42)).toBe(true)
    expect(JSON.stringify(events)).not.toContain('**')
  })

  it('reads a marker split across deltas as one turn', () => {
    const { events } = room('🧙 **Ma', 'ry:** hel', 'lo')
    expect(turns(events)).toEqual([['m#1', { agentId: 'bmad-agent-analyst', text: 'hello' }]])
  })

  it('reads `**Name**:` as well, and a name in any case', () => {
    expect(turns(room('**john**: yes').events)).toEqual([['m#1', { agentId: 'bmad-agent-pm', text: 'yes' }]])
  })

  it('starts a turn for every marker, even the same persona’s again', () => {
    const { events } = room('🧙 **Mary:** a\n📋 **John:** b\n🧙 **Mary:** c')
    expect(turns(events).map(([id, turn]) => [id, turn.agentId])).toEqual([
      ['m#1', 'bmad-agent-analyst'],
      ['m#2', 'bmad-agent-pm'],
      ['m#3', 'bmad-agent-analyst']
    ])
  })

  it('counts turns through the session, so a later message never reuses an id', () => {
    const first = run([messageStart('m1'), textStart(0), textDelta(0, '🧙 **Mary:** a'), stop(0)], ROOM)
    const second = run(
      [messageStart('m2'), textStart(0), textDelta(0, '🧙 **Mary:** b'), stop(0)],
      ROOM,
      first.state
    )
    expect(turns(second.events).map(([id]) => id)).toEqual(['m2#2'])
  })

  it('drops the words of a name the roster does not have, until a known marker', () => {
    const { events } = room('🎭 **Zed:** hi\n🧙 **Mary:** there')
    expect(turns(events)).toEqual([['m#2', { agentId: 'bmad-agent-analyst', text: 'there' }]])
  })

  it.each([
    ['a bold label with a colon inside', '**Pros:** fast'],
    ['a bold label with the colon outside', '**Note**: slow'],
    ['a bold label in a list', '- **Risk:** big'],
    ['a numbered bold label', '1. **Cost:** low']
  ])('reads %s as the speaker’s own words, with no change of speaker and no new turn', (_name, label) => {
    const { events, state } = room(`🧙 **Mary:** Intro\n${label}\nafter`)
    expect(turns(events)).toEqual([['m#1', { agentId: 'bmad-agent-analyst', text: `Intro\n${label}\nafter` }]])
    expect(state.party.turns).toBe(1)
  })

  it('reads a label split across deltas the same way, blanks after it kept', () => {
    const { events } = room('🧙 **Mary:** a\n**Pros:**', ' fast')
    expect(turns(events)).toEqual([['m#1', { agentId: 'bmad-agent-analyst', text: 'a\n**Pros:** fast' }]])
  })

  it('still reads a known roster name as a marker with or without an icon, and an unknown name behind an icon as one', () => {
    expect(turns(room('**John:** yes\n- **Mary:** hm').events).map(([id, turn]) => [id, turn.agentId])).toEqual([
      ['m#1', 'bmad-agent-pm'],
      ['m#2', 'bmad-agent-analyst']
    ])
    // `🎭 **Zed:**` names no one: Mary's turn ends there and Zed's words are dropped.
    const { events, state } = room('🧙 **Mary:** a\n🎭 **Zed:** hi')
    expect(turns(events)).toEqual([['m#1', { agentId: 'bmad-agent-analyst', text: 'a\n' }]])
    expect(state.party.turns).toBe(2)
  })

  it('says a short held line of the speaker when the block stops: `Ok` after a marker line', () => {
    const { events } = room('🧙 **Mary:** hi\nOk')
    expect(said(events).map((payload) => [payload.agentId, payload.text])).toEqual([
      ['bmad-agent-analyst', 'hi\n'],
      ['bmad-agent-analyst', 'Ok']
    ])
  })

  it('says the held line when a new message starts instead of a block stop', () => {
    const { events } = run(
      [messageStart('m'), textStart(0), textDelta(0, '🧙 **Mary:** hi\nOk'), messageStart('n')],
      ROOM
    )
    expect(said(events).map((payload) => [payload.agentId, payload.messageId, payload.text])).toEqual([
      ['bmad-agent-analyst', 'm#1', 'hi\n'],
      ['bmad-agent-analyst', 'm#1', 'Ok']
    ])
  })

  it('reads a marker at the start of a second text block, with no marker text in either turn', () => {
    const { events } = run(
      [
        messageStart('m'),
        textStart(0),
        textDelta(0, '🧙 **Mary:** a'),
        stop(0),
        textStart(1),
        textDelta(1, '📋 **John:** b'),
        stop(1)
      ],
      ROOM
    )
    expect(turns(events)).toEqual([
      ['m#1', { agentId: 'bmad-agent-analyst', text: 'a' }],
      ['m#2', { agentId: 'bmad-agent-pm', text: 'b' }]
    ])
    expect(JSON.stringify(events)).not.toContain('**')
  })

  it('drops the text before the first marker of a message', () => {
    const { events } = room('Welcome!\n🧙 **Mary:** hi')
    expect(turns(events)).toEqual([['m#1', { agentId: 'bmad-agent-analyst', text: 'hi' }]])
  })

  it('drops the text of a message that has no marker, and holds nothing back across a block stop', () => {
    expect(said(room('plain prose, no marker').events)).toEqual([])
    expect(said(room('**bold', ' text but never a marker').events)).toEqual([])
  })

  it('carries the speaker through the later blocks of a message, and forgets it at a new message', () => {
    const frames = [
      messageStart('m'),
      textStart(0),
      textDelta(0, '🧙 **Mary:** one'),
      stop(0),
      textStart(1),
      textDelta(1, ' two'),
      stop(1),
      messageStart('n'),
      textStart(0),
      textDelta(0, 'orphaned words'),
      stop(0)
    ]
    const { events } = run(frames, ROOM)
    expect(turns(events)).toEqual([['m#1', { agentId: 'bmad-agent-analyst', text: 'one two' }]])
  })

  it('takes each turn’s time from the delta that carried its marker', () => {
    let state = initialRouteState
    const events: ContractEvent[] = []
    const frames: [unknown, number][] = [
      [messageStart('m'), 1],
      [textStart(0), 1],
      [textDelta(0, '🧙 **Mary:** a\n'), 10],
      [textDelta(0, 'more\n'), 20],
      [textDelta(0, '📋 **John:** b'), 30]
    ]
    for (const [frame, now] of frames) {
      const routed = routeFrame(state, frame, { ...ROOM, now })
      state = routed.state
      events.push(...routed.events)
    }
    expect(said(events).map((payload) => [payload.agentId, payload.at])).toEqual([
      ['bmad-agent-analyst', 10],
      ['bmad-agent-analyst', 10],
      ['bmad-agent-pm', 30]
    ])
  })

  it('attributes nothing when the window has no roster', () => {
    const { roster: _roster, ...bare } = ROOM
    void _roster
    const { events } = run([messageStart('m'), textStart(0), textDelta(0, '🧙 **Mary:** hi'), stop(0)], bare)
    expect(events).toEqual([])
  })

  it('leaves a persona’s session as it was: no marker is read, no room flag set', () => {
    const { events, state } = run(
      [messageStart('m'), textStart(0), textDelta(0, '🧙 **Mary:** hi'), stop(0)],
      { ...CTX, roster: ROOM.roster }
    )
    expect(events).toEqual([
      { name: 'persona:said', payload: { sessionId: 's1', agentId: 'bmad-agent-pm', messageId: 'm', text: '🧙 **Mary:** hi', at: CTX.now } }
    ])
    expect(state.party).toEqual(initialRouteState.party)
  })
})
