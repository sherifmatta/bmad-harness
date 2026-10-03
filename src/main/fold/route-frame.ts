import { posix } from 'node:path'
import type { ContractEvent } from '../../shared/events'
import type { AgentId, RunId, SessionId } from '../../shared/ids'
import { readFrame } from './frame'
import { feedFields, initialFieldDecoder } from './json-string-fields'
import type { FieldDecoder, FieldOp } from './json-string-fields'

/**
 * Where a raw frame's content goes. Four rules, all decided here and nowhere
 * else, so that the renderer never has to parse a frame:
 *
 * - main-thread speech outside a tool call is what the persona said;
 * - the text of a `Write` or `Edit` to a document is document prose;
 * - the same text aimed at `.memlog.md` is a run note and never prose;
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
type Destination = 'pending' | 'prose' | 'note' | 'none'

type ToolBlock = {
  kind: 'tool'
  callId: string
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

export type RouteState = {
  /** The main thread's current message; a new one resets its blocks. */
  messageId: string | undefined
  /** Keyed by block index, which is only unique within one message. */
  blocks: Readonly<Record<number, Block>>
  /** How many messages arrived without an id, so each can be given one of its own. */
  unnamed: number
}

export const initialRouteState: RouteState = { messageId: undefined, blocks: {}, unnamed: 0 }

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
  if (block.destination === 'note') {
    return {
      name: 'run:note',
      payload: { runId, sessionId: ctx.sessionId, callId: block.callId, text, at: ctx.now }
    }
  }
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
      if (docPath === undefined) {
        next = { ...next, destination: 'none', held: '' }
      } else if (posix.basename(docPath) === MEMLOG) {
        next = { ...next, destination: 'note', docPath }
      } else {
        next = { ...next, destination: 'prose', docPath }
      }
      if (next.destination !== 'none') {
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
      return { state: { messageId, blocks: {}, unnamed }, events: [] }
    }

    // The turn's end and the background tasks are the turn fold's, not a routing concern.
    case 'turn-result':
    case 'background-tasks':
      return { state, events: [] }

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
      return { state: withBlock(state, input.index, applied.block), events: applied.events }
    }

    case 'block-stop':
      return { state: withoutBlock(state, input.index), events: [] }
  }
}
