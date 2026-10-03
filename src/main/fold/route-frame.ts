import { posix } from 'node:path'
import type { ContractEvent } from '../../shared/events'
import type { AgentId, RunId, SessionId } from '../../shared/ids'
import { readFrame } from './frame'
import type { ToolResult } from './frame'
import { feedFields, initialFieldDecoder } from './json-string-fields'
import type { FieldDecoder, FieldOp } from './json-string-fields'
import { sectionHeadings } from './section-headings'

/**
 * Where a raw frame's content goes. Five rules, all decided here and nowhere
 * else, so that the renderer never has to parse a frame:
 *
 * - main-thread speech outside a tool call is what the persona said;
 * - the text of a run's `Write` or `Edit` to a file in the project is document
 *   prose, and the call is held as a pending write until its result;
 * - a pending write's `tool_result` commits it: exactly one `doc:committed` per
 *   call, carrying the level-2 headings of what it wrote, or, when the tool
 *   refused it, the envelope and no sections (AD-5);
 * - the same text aimed at `.memlog.md` goes nowhere: run notes come from the
 *   file, which the watcher sees once, and never from the stream, so memlog
 *   text cannot enter a document's prose or its sections;
 * - anything attributed to a subagent is not the main thread's, and is ignored.
 *
 * The complete message the CLI repeats after its fragments carries bytes that
 * were already routed as they streamed, so it yields nothing: emitting from it
 * as well would say everything twice.
 *
 * This is a pure function of the state it is handed, the frame, and the
 * context. Time arrives as `ctx.now`; nothing is read or written.
 */

/** What the fold knows about the call it is routing for. */
export type RouteContext = {
  sessionId: SessionId
  agentId?: AgentId
  /** Absent in a chat turn, which raises no document or note event. */
  runId?: RunId
  /** Absolute, as the CLI reports paths. */
  projectRoot: string
  /** Epoch milliseconds, injected so the fold never reads a clock. */
  now: number
}

/** The routed outcome of one frame. */
export type RouteResult = { state: RouteState; events: ContractEvent[] }

/**
 * Where a tool's text is headed, which is only known once its `file_path`
 * closes. Until then the text is held so nothing is lost or misrouted.
 */
type Destination = 'pending' | 'prose' | 'none'

type ToolBlock = {
  kind: 'tool'
  callId: string
  /** The tool's own name: `Write` or `Edit`. */
  tool: string
  /** The input field that carries the text being written. */
  textField: string
  decoder: FieldDecoder
  pathText: string
  destination: Destination
  /** The project-relative path, once the destination is prose. */
  docPath: string
  held: string
}

type Block = { kind: 'text' } | { kind: 'other' } | ToolBlock

/**
 * A document write whose path is known and whose result has not come back:
 * where it writes, which tool, and every character of its text so far.
 */
export type PendingWrite = { path: string; tool: string; text: string }

export type RouteState = {
  /** The main thread's current message; a new one resets its blocks. */
  messageId: string | undefined
  /** Keyed by block index, which is only unique within one message. */
  blocks: Readonly<Record<number, Block>>
  /** How many messages arrived without an id, so each can be given one of its own. */
  unnamed: number
  /**
   * The run's document writes awaiting their `tool_result`, by call id. They
   * outlive the block and the message that streamed them; the end of the run
   * drops whatever never came back (`withoutPendingWrites`).
   */
  writes: Readonly<Record<string, PendingWrite>>
}

export const initialRouteState: RouteState = { messageId: undefined, blocks: {}, unnamed: 0, writes: {} }

/** The state with every pending write dropped: the run ended before they came back, so none commits. */
export function withoutPendingWrites(state: RouteState): RouteState {
  return Object.keys(state.writes).length === 0 ? state : { ...state, writes: {} }
}

/** The tools whose input is a document write, and the field holding the words. */
export const WRITE_FIELDS: Readonly<Record<string, string>> = { Write: 'content', Edit: 'new_string' }

export const MEMLOG = '.memlog.md'

/**
 * A path as the project sees it: relative, POSIX, with nothing escaping the
 * root. Anything else is outside the project and has no such path.
 */
export function projectRelative(filePath: string, projectRoot: string): string | undefined {
  if (filePath === '') return undefined
  const absolute = posix.resolve(projectRoot, filePath)
  const relative = posix.relative(posix.resolve(projectRoot), absolute)
  if (relative === '' || relative === '..' || relative.startsWith('../') || posix.isAbsolute(relative)) {
    return undefined
  }
  return relative
}

function withBlock(state: RouteState, index: number, block: Block): RouteState {
  return { ...state, blocks: { ...state.blocks, [index]: block } }
}

function withoutBlock(state: RouteState, index: number): RouteState {
  const blocks = { ...state.blocks }
  delete blocks[index]
  return { ...state, blocks }
}

function textEvent(
  block: ToolBlock,
  text: string,
  ctx: RouteContext,
  runId: RunId
): ContractEvent | undefined {
  if (text === '') return undefined
  if (block.destination === 'prose') {
    return {
      name: 'doc:prose',
      payload: {
        runId,
        sessionId: ctx.sessionId,
        callId: block.callId,
        path: block.docPath,
        text,
        at: ctx.now
      }
    }
  }
  return undefined
}

/** Apply decoded input ops to a tool block, returning it and what it emits. */
function applyOps(
  block: ToolBlock,
  ops: FieldOp[],
  decoder: FieldDecoder,
  ctx: RouteContext
): { block: ToolBlock; events: ContractEvent[] } {
  let next: ToolBlock = { ...block, decoder }
  const events: ContractEvent[] = []
  const runId = ctx.runId

  const emit = (text: string): void => {
    if (runId === undefined) return
    const event = textEvent(next, text, ctx, runId)
    if (event) events.push(event)
  }

  for (const op of ops) {
    if (op.field === 'file_path' && next.destination === 'pending') {
      if (op.kind === 'text') {
        next = { ...next, pathText: next.pathText + op.text }
        continue
      }
      const docPath = projectRelative(next.pathText, ctx.projectRoot)
      if (docPath === undefined || posix.basename(docPath) === MEMLOG) {
        next = { ...next, destination: 'none', held: '' }
      } else {
        next = { ...next, destination: 'prose', docPath }
        emit(next.held)
        next = { ...next, held: '' }
      }
    } else if (op.field === next.textField && op.kind === 'text') {
      if (next.destination === 'pending') next = { ...next, held: next.held + op.text }
      else emit(op.text)
    }
  }
  return { block: next, events }
}

/** Hold a write once its path is known, and add to it whatever prose it just emitted. */
function withWritten(
  writes: RouteState['writes'],
  before: ToolBlock,
  after: ToolBlock,
  events: ContractEvent[]
): RouteState['writes'] {
  if (after.destination !== 'prose') return writes
  const text = events.map((event) => (event.name === 'doc:prose' ? event.payload.text : '')).join('')
  const held = writes[after.callId]
  if (before.destination === 'prose' && held !== undefined && text === '') return writes
  const base = held ?? { path: after.docPath, tool: after.tool, text: '' }
  return { ...writes, [after.callId]: { ...base, text: base.text + text } }
}

/** One `doc:committed` per pending write a result answers; the write is no longer pending. */
function commitResults(
  state: RouteState,
  results: readonly ToolResult[],
  ctx: RouteContext
): RouteResult {
  let writes = state.writes
  const events: ContractEvent[] = []
  for (const { callId, failed } of results) {
    const write = writes[callId]
    if (write === undefined) continue
    const rest = { ...writes }
    delete rest[callId]
    writes = rest
    if (ctx.runId === undefined) continue
    const base = { runId: ctx.runId, sessionId: ctx.sessionId, callId, path: write.path, at: ctx.now }
    events.push(
      failed
        ? {
            name: 'doc:committed',
            payload: {
              ...base,
              ok: false,
              error: { code: 'doc/write-rejected', message: `doc · the ${write.tool.toLowerCase()} was rejected` }
            }
          }
        : { name: 'doc:committed', payload: { ...base, ok: true, sections: sectionHeadings(write.text) } }
    )
  }
  return writes === state.writes ? { state, events } : { state: { ...state, writes }, events }
}

function personaSaid(state: RouteState, text: string, ctx: RouteContext): ContractEvent {
  return {
    name: 'persona:said',
    payload: {
      sessionId: ctx.sessionId,
      ...(ctx.agentId === undefined ? {} : { agentId: ctx.agentId }),
      messageId: state.messageId ?? '',
      text,
      at: ctx.now
    }
  }
}

/**
 * Fold one raw frame into the next state and the domain events it yields.
 * Never throws: an unfamiliar or malformed frame yields no events and leaves
 * the state as it was.
 */
export function routeFrame(state: RouteState, frame: unknown, ctx: RouteContext): RouteResult {
  const input = readFrame(frame)
  if (input === undefined) return { state, events: [] }

  switch (input.kind) {
    case 'message-start': {
      // A message with no id still needs one, or two of them would be one record:
      // it is made from the session and a count, so no other message can share it.
      const unnamed = input.messageId === '' ? state.unnamed + 1 : state.unnamed
      const messageId =
        input.messageId === '' ? `unnamed-${ctx.sessionId}-${unnamed}` : input.messageId
      return { state: { ...state, messageId, blocks: {}, unnamed }, events: [] }
    }

    // The turn's end and the background tasks are the turn fold's, not a routing concern.
    case 'turn-result':
    case 'background-tasks':
      return { state, events: [] }

    case 'tool-results':
      return commitResults(state, input.results, ctx)

    case 'block-start': {
      const head = input.block
      if (head.type === 'text') return { state: withBlock(state, input.index, { kind: 'text' }), events: [] }
      const textField = head.type === 'tool' ? WRITE_FIELDS[head.name] : undefined
      if (head.type !== 'tool' || textField === undefined || ctx.runId === undefined) {
        return { state: withBlock(state, input.index, { kind: 'other' }), events: [] }
      }
      const tool: ToolBlock = {
        kind: 'tool',
        callId: head.callId,
        tool: head.name,
        textField,
        decoder: initialFieldDecoder,
        pathText: '',
        destination: 'pending',
        docPath: '',
        held: ''
      }
      return { state: withBlock(state, input.index, tool), events: [] }
    }

    case 'text-delta': {
      // Speech is a text block's: a delta with no open block, or in one that is
      // not text, belongs to nothing the fold saw begin, and is dropped.
      const block = state.blocks[input.index]
      if (block === undefined || block.kind !== 'text' || input.text === '') {
        return { state, events: [] }
      }
      return { state, events: [personaSaid(state, input.text, ctx)] }
    }

    case 'json-delta': {
      const block = state.blocks[input.index]
      if (block === undefined || block.kind !== 'tool') return { state, events: [] }
      const decoded = feedFields(block.decoder, input.partial, ['file_path', block.textField])
      const applied = applyOps(block, decoded.ops, decoded.state, ctx)
      // A write is pending only inside a run: one left streaming after its run ended never commits.
      const writes =
        ctx.runId === undefined ? state.writes : withWritten(state.writes, block, applied.block, applied.events)
      const next = withBlock(state, input.index, applied.block)
      return { state: writes === state.writes ? next : { ...next, writes }, events: applied.events }
    }

    case 'block-stop':
      return { state: withoutBlock(state, input.index), events: [] }
  }
}
