import { posix } from 'node:path'
import type { ContractEvent } from '../../shared/events'
import type { AgentId, RunId, SessionId } from '../../shared/ids'
import { readFrame } from './frame'
import type { ToolResult } from './frame'
import { feedFields, initialFieldDecoder } from './json-string-fields'
import type { FieldDecoder, FieldOp } from './json-string-fields'
import { flushScan, initialScan, scanText, speakerNamed } from './party-speech'
import type { Piece, Scan } from './party-speech'
import { MEMLOG, projectRelative } from './project-path'
import { sectionHeadings } from './section-headings'
import { FIELD_BUFFER_MAX, keepsHeadOfField, labelFieldOf, stepLabel } from './step-label'

/**
 * Where a raw frame's content goes. Six rules, all decided here and nowhere
 * else, so that the renderer never has to parse a frame:
 *
 * - main-thread speech outside a tool call is what the persona said; in a room, which has
 *   no persona of its own, it is what the persona named by the turn's marker said
 *   (`party-speech`), and speech with no such marker is no one's and goes nowhere;
 * - the text of a run's `Write` to a file in the project is document prose,
 *   and replaces the run's buffer of that path as it streams; an `Edit` streams
 *   nothing, and its `old_string` and `new_string` are held whole. Either call
 *   is held as a pending write until its result;
 * - a pending write's `tool_result` commits it: exactly one `doc:committed` per
 *   call, carrying the level-2 headings of the document at that path after the
 *   call, and for an `Edit` that applied, the patched document whole; when the
 *   tool refused it, the envelope and no sections (AD-5);
 * - the same text aimed at `.memlog.md` goes nowhere: run notes come from the
 *   file, which the watcher sees once, and never from the stream, so memlog
 *   text cannot enter a document's prose or its sections;
 * - every other main-thread tool call of a run, a document write included, is one step: `running`
 *   when its input has finished streaming (`content_block_stop`), then `done` or `failed` on its
 *   result, under the call's id. Its label is derived by `step-label` from the one input field
 *   its table allows, which is all the fold decodes of it; a call aimed at `.memlog.md`, and any
 *   call outside a run, raises none (AD-22);
 * - anything attributed to a subagent is not the main thread's, and is ignored: its calls open
 *   and close no step, and the main-thread call that spawned it is one.
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
  /**
   * Set for a skill-first session (Story 7.5), to its own session id: it has no persona and no room's
   * markers, so its speech is the skill's and carries this flag. A session with neither this nor an
   * `agentId` is the room.
   */
  skillSession?: SessionId
  /** Absent in a chat turn, which raises no document or note event. */
  runId?: RunId
  /** Absolute, as the CLI reports paths. */
  projectRoot: string
  /** Epoch milliseconds, injected so the fold never reads a clock. */
  now: number
  /**
   * The window's resolved roster, which a room's markers are read against (Story 4.2).
   * Read only by the room (no `agentId`, no `skillSession`); a persona's session and a skill's never look at it.
   */
  roster?: readonly { id: string; name: string }[]
}

/** The routed outcome of one frame. */
export type RouteResult = { state: RouteState; events: ContractEvent[] }

/**
 * Where a tool's text is headed, which is only known once its `file_path`
 * closes. Until then the text is held so nothing is lost or misrouted.
 */
type Destination = 'pending' | 'prose' | 'none'

/**
 * The one input field a step's label reads, as far as it has streamed: held whole or not at all.
 * Past `FIELD_BUFFER_MAX` it is dropped (`over`), and the label is the verb alone.
 */
type LabelField = { text: string; over: boolean; done: boolean }

const noLabelField: LabelField = { text: '', over: false, done: false }

type ToolBlock = {
  kind: 'tool'
  callId: string
  /** The tool's own name: `Write` or `Edit`. */
  tool: string
  /** The `file_path` the label reads. */
  label: LabelField
  /** The input field that carries the text being written. */
  textField: string
  decoder: FieldDecoder
  pathText: string
  destination: Destination
  /** The project-relative path, once the destination is prose. */
  docPath: string
  held: string
  /** An `Edit`'s `old_string`, decoded so far. */
  oldText: string
}

/** Any other main-thread tool call of a run: a step, and nothing else of its input is decoded but its label's field. */
type StepBlock = {
  kind: 'step'
  callId: string
  tool: string
  decoder: FieldDecoder
  label: LabelField
}

type Block = { kind: 'text' } | { kind: 'other' } | ToolBlock | StepBlock

/**
 * A document write whose path is known and whose result has not come back:
 * where it writes, which tool, every character of its text so far, and for an
 * `Edit`, the text it replaces.
 */
export type PendingWrite = { path: string; tool: string; text: string; old: string }

/**
 * What the room's turn markers have told so far (Story 4.2). Held in every state and
 * touched only for the room (no `agentId`, no `skillSession`): a persona's session or a skill's never changes it.
 */
export type PartyState = {
  /** The scan's memory: text held back at a line start, and whether the next character begins a line. */
  scan: Scan
  /** Who the current message's speech is, by roster id; none before its first marker and after one that named no one. */
  speaker: AgentId | undefined
  /** How many markers this session has seen: each starts a turn, and the count is the turn's ordinal. */
  turns: number
  /** The instant of the delta that carried the current turn's marker. */
  turnAt: number
}

export const initialParty: PartyState = { scan: initialScan, speaker: undefined, turns: 0, turnAt: 0 }

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
  /**
   * The run's documents by project-relative path: the text of the latest
   * `Write` to each, as it streamed, patched by each `Edit` that applied. Only
   * a `Write` starts one; the end of the run drops them all.
   */
  docs: Readonly<Record<string, string>>
  /**
   * The run's tool calls whose step is `running`, by call id. They outlive the block and the
   * message that streamed them; the end of the run drops whatever never came back.
   */
  steps: Readonly<Record<string, true>>
  /** The room's turn markers: who is speaking, and the turn they are in (Story 4.2). */
  party: PartyState
}

export const initialRouteState: RouteState = {
  messageId: undefined,
  blocks: {},
  unnamed: 0,
  writes: {},
  docs: {},
  steps: {},
  party: initialParty
}

/**
 * The state with every pending write, every document buffer and every open step dropped: the
 * run ended, so none of its writes commits, its buffers are not the next run's, and a call that
 * never reported closes on the card (`fold/run-card.ts`), not here.
 */
export function withoutPendingWrites(state: RouteState): RouteState {
  return Object.keys(state.writes).length === 0 &&
    Object.keys(state.docs).length === 0 &&
    Object.keys(state.steps).length === 0
    ? state
    : { ...state, writes: {}, docs: {}, steps: {} }
}

/** The tools whose input is a document write, and the field holding the words. */
export const WRITE_FIELDS: Readonly<Record<string, string>> = { Write: 'content', Edit: 'new_string' }

/** The `Edit` input field holding the text it replaces. */
const OLD_FIELD = 'old_string'

export { MEMLOG, projectRelative }

/** The label buffer after the ops the decoder just produced for the field the label reads. */
function withLabelOps(label: LabelField, field: string | undefined, ops: readonly FieldOp[], keepHead = false): LabelField {
  let next = label
  for (const op of ops) {
    if (op.field !== field) continue
    if (op.kind === 'end') {
      next = { ...next, done: true }
    } else if (!next.over) {
      const text = next.text + op.text
      // A program name is the head of a command: the rest of a long one is not kept.
      if (keepHead && text.length > FIELD_BUFFER_MAX) next = { ...next, text: text.slice(0, FIELD_BUFFER_MAX) }
      else next = text.length > FIELD_BUFFER_MAX ? { text: '', over: true, done: next.done } : { ...next, text }
    }
  }
  return next
}

/** The step `running`, when the call is whole: its label from the field it streamed, unless the call has no step. */
function openStep(state: RouteState, block: ToolBlock | StepBlock, ctx: RouteContext): RouteResult {
  if (ctx.runId === undefined || state.steps[block.callId] !== undefined) return { state, events: [] }
  const field = block.label.done && !block.label.over ? block.label.text : undefined
  const label = stepLabel(block.tool, field, ctx.projectRoot)
  if (label === undefined) return { state, events: [] }
  return {
    state: { ...state, steps: { ...state.steps, [block.callId]: true } },
    events: [
      {
        name: 'run:step',
        payload: { runId: ctx.runId, sessionId: ctx.sessionId, callId: block.callId, status: 'running', label, at: ctx.now }
      }
    ]
  }
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
  if (text === '' || block.tool !== 'Write') return undefined
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

/**
 * Apply decoded input ops to a tool block, returning it, what it emits, and
 * the text it added to the write, emitted or not (an `Edit` emits none).
 */
function applyOps(
  block: ToolBlock,
  ops: FieldOp[],
  decoder: FieldDecoder,
  ctx: RouteContext
): { block: ToolBlock; events: ContractEvent[]; text: string } {
  let next: ToolBlock = { ...block, decoder }
  const events: ContractEvent[] = []
  const runId = ctx.runId
  let text = ''

  const take = (piece: string): void => {
    text += piece
    if (runId === undefined) return
    const event = textEvent(next, piece, ctx, runId)
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
        take(next.held)
        next = { ...next, held: '' }
      }
    } else if (op.field === next.textField && op.kind === 'text') {
      if (next.destination === 'pending') next = { ...next, held: next.held + op.text }
      else if (next.destination === 'prose') take(op.text)
    } else if (op.field === OLD_FIELD && op.kind === 'text') {
      next = { ...next, oldText: next.oldText + op.text }
    }
  }
  return { block: next, events, text }
}

/**
 * Hold a write once its path is known, and add to it the text it just gained;
 * a `Write`'s text is also, from its first character, the run's buffer of that path.
 */
function withWritten(state: RouteState, before: ToolBlock, after: ToolBlock, text: string): RouteState {
  if (after.destination !== 'prose') return state
  const held = state.writes[after.callId]
  if (before.destination === 'prose' && held !== undefined && text === '' && held.old === after.oldText) return state
  const base = held ?? { path: after.docPath, tool: after.tool, text: '', old: '' }
  const write = { ...base, text: base.text + text, old: after.oldText }
  const writes = { ...state.writes, [after.callId]: write }
  const docs = after.tool === 'Write' && write.text !== '' ? { ...state.docs, [write.path]: write.text } : state.docs
  return { ...state, writes, docs }
}

/**
 * What an `Edit` that applied leaves of a document: every occurrence of its
 * `old_string` replaced, since a successful `Edit` had one or `replace_all`.
 * Nothing when there is no buffer, no old text, or the old text is not in it.
 */
function patched(doc: string | undefined, write: PendingWrite): string | undefined {
  if (doc === undefined || write.old === '' || !doc.includes(write.old)) return undefined
  return doc.split(write.old).join(write.text)
}

/** `Done` or `failed` for the open step of a call a result answers; the step is no longer open. */
function closeStep(
  steps: Readonly<Record<string, true>>,
  callId: string,
  failed: boolean,
  ctx: RouteContext
): { steps: Readonly<Record<string, true>>; event?: ContractEvent } {
  if (steps[callId] === undefined || ctx.runId === undefined) return { steps }
  const rest = { ...steps }
  delete rest[callId]
  return {
    steps: rest,
    event: {
      name: 'run:step',
      payload: { runId: ctx.runId, sessionId: ctx.sessionId, callId, status: failed ? 'failed' : 'done', at: ctx.now }
    }
  }
}

/**
 * One `doc:committed` per pending write a result answers; the write is no
 * longer pending. An `ok` commit names the sections of the document at its path
 * after the call, and an `Edit` that applied carries the patched document whole.
 * The call's step closes on the same result, after its commit.
 */
function commitResults(
  state: RouteState,
  results: readonly ToolResult[],
  ctx: RouteContext
): RouteResult {
  let writes = state.writes
  let docs = state.docs
  let steps = state.steps
  const events: ContractEvent[] = []
  for (const { callId, failed } of results) {
    const write = writes[callId]
    if (write !== undefined) {
      const rest = { ...writes }
      delete rest[callId]
      writes = rest
      const commit = ctx.runId === undefined ? undefined : committedBy(write, callId, failed, docs, ctx.runId, ctx)
      if (commit !== undefined) {
        docs = commit.docs
        events.push(commit.event)
      }
    }
    const closed = closeStep(steps, callId, failed, ctx)
    steps = closed.steps
    if (closed.event !== undefined) events.push(closed.event)
  }
  return writes === state.writes && steps === state.steps ? { state, events } : { state: { ...state, writes, docs, steps }, events }
}

/** The `doc:committed` a pending write's result makes, and the run's documents after it. */
function committedBy(
  write: PendingWrite,
  callId: string,
  failed: boolean,
  docs: Readonly<Record<string, string>>,
  runId: RunId,
  ctx: RouteContext
): { event: ContractEvent; docs: Readonly<Record<string, string>> } {
  const base = { runId, sessionId: ctx.sessionId, callId, path: write.path, at: ctx.now }
  if (failed) {
    return {
      docs,
      event: {
        name: 'doc:committed',
        payload: {
          ...base,
          ok: false,
          error: { code: 'doc/write-rejected', message: `doc · the ${write.tool.toLowerCase()} was rejected` }
        }
      }
    }
  }
  if (write.tool !== 'Edit') {
    return { docs, event: { name: 'doc:committed', payload: { ...base, ok: true, sections: sectionHeadings(write.text) } } }
  }
  const doc = docs[write.path]
  const text = patched(doc, write)
  return {
    docs: text === undefined ? docs : { ...docs, [write.path]: text },
    event: {
      name: 'doc:committed',
      payload: {
        ...base,
        ok: true,
        sections: sectionHeadings(text ?? doc ?? ''),
        ...(text === undefined ? {} : { text })
      }
    }
  }
}

/** Whether the session this context is for is the room: no persona of its own, and no skill's. */
function isRoom(ctx: RouteContext): boolean {
  return ctx.agentId === undefined && ctx.skillSession === undefined
}

function personaSaid(state: RouteState, text: string, ctx: RouteContext): ContractEvent {
  return {
    name: 'persona:said',
    payload: {
      sessionId: ctx.sessionId,
      ...(ctx.agentId === undefined ? {} : { agentId: ctx.agentId }),
      ...(ctx.skillSession === undefined ? {} : { skillSession: ctx.skillSession }),
      messageId: state.messageId ?? '',
      text,
      at: ctx.now
    }
  }
}

/**
 * What the scan found in a room's text, as the party's memory and the events it yields: a marker
 * starts a turn (its name read against the roster, its ordinal the marker count, its instant the
 * delta that carried it), and speech is the current speaker's, one `persona:said` per piece with the
 * turn's own `messageId`. Speech with no known speaker is dropped: nothing is attributed that no
 * marker named.
 */
function foldPieces(
  state: RouteState,
  party: PartyState,
  pieces: readonly Piece[],
  ctx: RouteContext
): { party: PartyState; events: ContractEvent[] } {
  let next = party
  const events: ContractEvent[] = []
  for (const piece of pieces) {
    if (piece.kind === 'marker') {
      next = {
        ...next,
        speaker: speakerNamed(piece.name, ctx.roster ?? []),
        turns: next.turns + 1,
        turnAt: ctx.now
      }
    } else if (next.speaker !== undefined) {
      events.push({
        name: 'persona:said',
        payload: {
          sessionId: ctx.sessionId,
          agentId: next.speaker,
          messageId: `${state.messageId ?? ''}#${next.turns}`,
          text: piece.text,
          at: next.turnAt,
          room: true
        }
      })
    }
  }
  return { party: next, events }
}

/** A room's held text is speech from here on: the block it belongs to ended, or a new message began. */
function flushParty(state: RouteState, ctx: RouteContext): RouteResult {
  if (!isRoom(ctx) || state.party.scan.held === '') return { state, events: [] }
  const flushed = flushScan(state.party.scan)
  const folded = foldPieces(state, state.party, flushed.pieces, ctx)
  return { state: { ...state, party: { ...folded.party, scan: flushed.scan } }, events: folded.events }
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
      // A room's held text is the old message's; a new one has no speaker until its first marker.
      const flushed = flushParty(state, ctx)
      const party =
        isRoom(ctx)
          ? { ...flushed.state.party, scan: initialScan, speaker: undefined }
          : state.party
      return { state: { ...flushed.state, messageId, blocks: {}, unnamed, party }, events: flushed.events }
    }

    // The turn's end and the background tasks are the turn fold's, not a routing concern.
    case 'turn-result':
    case 'background-tasks':
      return { state, events: [] }

    case 'tool-results':
      return commitResults(state, input.results, ctx)

    case 'block-start': {
      const head = input.block
      if (head.type === 'text') {
        // A text block begins at the start of a line.
        const begun =
          isRoom(ctx) ? { ...state, party: { ...state.party, scan: { ...state.party.scan, lineStart: true } } } : state
        return { state: withBlock(begun, input.index, { kind: 'text' }), events: [] }
      }
      if (head.type !== 'tool' || ctx.runId === undefined) {
        return { state: withBlock(state, input.index, { kind: 'other' }), events: [] }
      }
      const textField = Object.prototype.hasOwnProperty.call(WRITE_FIELDS, head.name) ? WRITE_FIELDS[head.name] : undefined
      if (textField === undefined) {
        const step: StepBlock = {
          kind: 'step',
          callId: head.callId,
          tool: head.name,
          decoder: initialFieldDecoder,
          label: noLabelField
        }
        return { state: withBlock(state, input.index, step), events: [] }
      }
      const tool: ToolBlock = {
        kind: 'tool',
        callId: head.callId,
        tool: head.name,
        label: noLabelField,
        textField,
        decoder: initialFieldDecoder,
        pathText: '',
        destination: 'pending',
        docPath: '',
        held: '',
        oldText: ''
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
      if (!isRoom(ctx)) return { state, events: [personaSaid(state, input.text, ctx)] }
      // A room has no persona of its own: its text is read for the markers that name who speaks.
      // A name the roster does not have is a marker only behind an icon; a bold label is the speaker's own words.
      const roster = ctx.roster ?? []
      const scanned = scanText(
        state.party.scan,
        input.text,
        (name, icon) => icon || speakerNamed(name, roster) !== undefined
      )
      const folded = foldPieces(state, state.party, scanned.pieces, ctx)
      return { state: { ...state, party: { ...folded.party, scan: scanned.scan } }, events: folded.events }
    }

    case 'json-delta': {
      const block = state.blocks[input.index]
      if (block === undefined || (block.kind !== 'tool' && block.kind !== 'step')) return { state, events: [] }
      if (block.kind === 'step') {
        // Only the one field the label reads is decoded; the rest of the input is skipped unkept.
        const field = labelFieldOf(block.tool)
        const decoded = feedFields(block.decoder, input.partial, field === undefined ? [] : [field])
        const label = withLabelOps(block.label, field, decoded.ops, keepsHeadOfField(block.tool))
        return { state: withBlock(state, input.index, { ...block, decoder: decoded.state, label }), events: [] }
      }
      const watched = block.tool === 'Edit' ? ['file_path', block.textField, OLD_FIELD] : ['file_path', block.textField]
      const decoded = feedFields(block.decoder, input.partial, watched)
      const applied = applyOps(block, decoded.ops, decoded.state, ctx)
      applied.block = { ...applied.block, label: withLabelOps(block.label, 'file_path', decoded.ops) }
      // A write is pending only inside a run: one left streaming after its run ended never commits.
      const written = ctx.runId === undefined ? state : withWritten(state, block, applied.block, applied.text)
      return { state: withBlock(written, input.index, applied.block), events: applied.events }
    }

    case 'block-stop': {
      // What a room's text block still held is speech: the block is over.
      const block = state.blocks[input.index]
      const flushed = block?.kind === 'text' ? flushParty(state, ctx) : { state, events: [] }
      // A tool call whose input is whole is executing: its step begins.
      const stepped =
        block?.kind === 'tool' || block?.kind === 'step' ? openStep(flushed.state, block, ctx) : { state: flushed.state, events: [] }
      return { state: withoutBlock(stepped.state, input.index), events: [...flushed.events, ...stepped.events] }
    }
  }
}
