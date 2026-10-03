import type { ContractEvent } from '../../shared/events'

/**
 * The prose buffer: consecutive pieces of one call's document text, held and
 * joined so the window is told far fewer, longer pieces than the CLI streamed.
 * Pure: a buffer in, a buffer and the events now due out.
 *
 * Only `doc:prose` is held. Pieces merge while they are the same run's, the
 * same call's and the same path's; anything else — a piece of another call, or
 * any other event — releases what is held first, so the order of everything
 * the window is told is the order it happened in, and no byte is lost, added
 * or reordered. The merged piece keeps the `at` of its first piece.
 */

export type ProseEvent = Extract<ContractEvent, { name: 'doc:prose' }>

/** What is held: one merged piece, or nothing. */
export type ProseBuffer = ProseEvent | undefined

export type Coalesced = { buffer: ProseBuffer; out: ContractEvent[] }

function joins(held: ProseEvent, next: ProseEvent): boolean {
  return (
    held.payload.runId === next.payload.runId &&
    held.payload.sessionId === next.payload.sessionId &&
    held.payload.callId === next.payload.callId &&
    held.payload.path === next.payload.path
  )
}

/** Take one event: hold it if it is prose, else release what is held and pass it on. */
export function coalesce(buffer: ProseBuffer, event: ContractEvent): Coalesced {
  if (event.name !== 'doc:prose') {
    return { buffer: undefined, out: buffer === undefined ? [event] : [buffer, event] }
  }
  if (buffer === undefined) {
    return { buffer: event, out: [] }
  }
  if (joins(buffer, event)) {
    return {
      buffer: { name: 'doc:prose', payload: { ...buffer.payload, text: buffer.payload.text + event.payload.text } },
      out: []
    }
  }
  return { buffer: event, out: [buffer] }
}

/** Release whatever is held. */
export function flushProse(buffer: ProseBuffer): Coalesced {
  return { buffer: undefined, out: buffer === undefined ? [] : [buffer] }
}
