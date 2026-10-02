import { posix } from 'node:path'
import { readFrame } from './frame'
import { feedFields, initialFieldDecoder } from './json-string-fields'
import type { FieldDecoder } from './json-string-fields'
import { MEMLOG, WRITE_FIELDS, projectRelative } from './route-frame'

/**
 * The files a persona wrote in a chat turn, read from the same frames the route
 * fold reads and decoded by the same rules: a `Write` or `Edit` is a document
 * write (`WRITE_FIELDS`), its `file_path` becomes a project-relative POSIX path
 * (`projectRelative`), and `.memlog.md` and anything outside the project are not
 * documents. Unlike the route fold it raises no event, because a chat turn has
 * no run to raise one for: it only says which paths closed.
 *
 * A path is reported when its tool block closes, so a write that was begun and
 * never finished is not named. Only the main thread counts: a frame attributed
 * to a subagent is dropped by `readFrame` before anything here sees it.
 *
 * Pure: a function of the state it is handed and the frame, with no I/O.
 */

/** A write whose `file_path` is still arriving. */
type OpenWrite = { decoder: FieldDecoder; pathText: string; pathClosed: boolean }

export type WrittenState = {
  /** Keyed by block index, which is only unique within one message. */
  blocks: Readonly<Record<number, OpenWrite>>
}

export const initialWrittenState: WrittenState = { blocks: {} }

/** One frame folded: the next state and the project-relative paths that closed in it. */
export type WrittenResult = { state: WrittenState; paths: string[] }

export function foldWrittenPaths(
  state: WrittenState,
  frame: unknown,
  projectRoot: string
): WrittenResult {
  const input = readFrame(frame)
  if (input === undefined) return { state, paths: [] }

  switch (input.kind) {
    case 'message-start':
      return { state: initialWrittenState, paths: [] }

    case 'block-start': {
      const head = input.block
      if (head.type !== 'tool' || !Object.hasOwn(WRITE_FIELDS, head.name)) {
        return { state, paths: [] }
      }
      const open: OpenWrite = { decoder: initialFieldDecoder, pathText: '', pathClosed: false }
      return { state: { blocks: { ...state.blocks, [input.index]: open } }, paths: [] }
    }

    case 'json-delta': {
      const open = state.blocks[input.index]
      if (open === undefined || open.pathClosed) return { state, paths: [] }
      const decoded = feedFields(open.decoder, input.partial, ['file_path'])
      let pathText = open.pathText
      let pathClosed = false
      for (const op of decoded.ops) {
        if (op.field !== 'file_path') continue
        if (op.kind === 'text') pathText += op.text
        else pathClosed = true
      }
      const next: OpenWrite = { decoder: decoded.state, pathText, pathClosed }
      return { state: { blocks: { ...state.blocks, [input.index]: next } }, paths: [] }
    }

    case 'block-stop': {
      const open = state.blocks[input.index]
      if (open === undefined) return { state, paths: [] }
      const blocks = { ...state.blocks }
      delete blocks[input.index]
      const path = open.pathClosed ? projectRelative(open.pathText, projectRoot) : undefined
      const named = path !== undefined && posix.basename(path) !== MEMLOG
      return { state: { blocks }, paths: named ? [path] : [] }
    }

    case 'text-delta':
      return { state, paths: [] }
  }
}

/** `paths` after `closed` joins them: write order, each file once, never sorted. */
export function withWrittenPaths(paths: readonly string[], closed: readonly string[]): readonly string[] {
  const added = closed.filter((path, at) => !paths.includes(path) && closed.indexOf(path) === at)
  return added.length === 0 ? paths : [...paths, ...added]
}
