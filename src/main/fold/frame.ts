/**
 * The minimal shape of the raw frames the fold reads. The CLI's wire format
 * lives here and nowhere else: it is main's business to interpret it, and the
 * contract the renderer sees carries domain events only.
 *
 * Everything arrives as `unknown` and is narrowed field by field, because a
 * frame is whatever the CLI wrote and a malformed or unfamiliar one must be
 * ignored, never thrown at.
 */

/** The parts of a main-thread frame the fold acts on. */
export type FrameInput =
  | { kind: 'message-start'; messageId: string }
  /** The CLI's whole set of live background tasks, as it stands after the change. */
  | { kind: 'background-tasks'; taskIds: readonly string[] }
  /** The main thread ended a turn; `failed` is the CLI's own `is_error`, and `subtype` how it says it ended. */
  | { kind: 'turn-result'; failed: boolean; subtype: string | undefined }
  | { kind: 'block-start'; index: number; block: BlockHead }
  | { kind: 'text-delta'; index: number; text: string }
  | { kind: 'json-delta'; index: number; partial: string }
  | { kind: 'block-stop'; index: number }
  /** The main thread was told how its tool calls went: each call's id, and whether the tool refused it. */
  | { kind: 'tool-results'; results: readonly ToolResult[] }

/** One tool call's outcome, as the CLI reports it back to the model. */
export type ToolResult = { callId: string; failed: boolean }

/** What a content block declares itself to be when it opens. */
export type BlockHead =
  | { type: 'text' }
  | { type: 'tool'; callId: string; name: string }
  | { type: 'other' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function blockHead(raw: unknown): BlockHead {
  if (!isRecord(raw)) return { type: 'other' }
  if (raw.type === 'text') return { type: 'text' }
  if (raw.type === 'tool_use' && typeof raw.id === 'string' && typeof raw.name === 'string') {
    return { type: 'tool', callId: raw.id, name: raw.name }
  }
  return { type: 'other' }
}

/**
 * The tool results a main-thread `user` frame carries: its `message.content`
 * blocks of type `tool_result`, each naming the call it answers. A frame with
 * none (the user's own turn, a malformed one) says nothing.
 */
function toolResults(message: unknown): FrameInput | undefined {
  if (!isRecord(message) || !Array.isArray(message.content)) return undefined
  const results = (message.content as unknown[]).flatMap((block): ToolResult[] =>
    isRecord(block) && block.type === 'tool_result' && typeof block.tool_use_id === 'string'
      ? [{ callId: block.tool_use_id, failed: block.is_error === true }]
      : []
  )
  return results.length === 0 ? undefined : { kind: 'tool-results', results }
}

/**
 * Narrow one frame to what the fold needs, or `undefined` when it needs
 * nothing from it. A frame with a non-null `parent_tool_use_id` is subagent
 * activity: it is dropped here, before any state is consulted, because its
 * block indexes collide with the main thread's own and acting on it would
 * corrupt the main thread's blocks.
 */
export function readFrame(frame: unknown): FrameInput | undefined {
  if (!isRecord(frame)) return undefined
  if (frame.parent_tool_use_id !== null && frame.parent_tool_use_id !== undefined) return undefined
  if (frame.type === 'result') {
    return {
      kind: 'turn-result',
      failed: frame.is_error === true,
      subtype: typeof frame.subtype === 'string' ? frame.subtype : undefined
    }
  }
  if (frame.type === 'system' && frame.subtype === 'background_tasks_changed') {
    // A frame that does not carry the list says nothing about it, rather than that it is empty.
    if (!Array.isArray(frame.tasks)) return undefined
    const taskIds = (frame.tasks as unknown[]).flatMap((task) =>
      isRecord(task) && typeof task.task_id === 'string' ? [task.task_id] : []
    )
    return { kind: 'background-tasks', taskIds }
  }
  if (frame.type === 'user') return toolResults(frame.message)
  if (frame.type !== 'stream_event') return undefined

  const event = frame.event
  if (!isRecord(event)) return undefined

  if (event.type === 'message_start') {
    const message = event.message
    const id = isRecord(message) && typeof message.id === 'string' ? message.id : ''
    return { kind: 'message-start', messageId: id }
  }

  if (typeof event.index !== 'number') return undefined
  const index = event.index

  if (event.type === 'content_block_start') {
    return { kind: 'block-start', index, block: blockHead(event.content_block) }
  }
  if (event.type === 'content_block_stop') return { kind: 'block-stop', index }

  if (event.type === 'content_block_delta' && isRecord(event.delta)) {
    const delta = event.delta
    if (delta.type === 'text_delta' && typeof delta.text === 'string') {
      return { kind: 'text-delta', index, text: delta.text }
    }
    if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
      return { kind: 'json-delta', index, partial: delta.partial_json }
    }
  }
  return undefined
}
