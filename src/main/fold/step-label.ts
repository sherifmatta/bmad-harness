import { posix } from 'node:path'
import { MEMLOG, projectRelative } from './project-path'

/**
 * A run step's label (AD-22): the only thing about a tool call's input that crosses to the
 * window. Pure: a closed table of tool name to a verb and ONE allow-listed input field, and
 * nothing else of the input is ever kept or sent. The words are placeholder copy (`bmad-ux`
 * owns them): a lower-case verb, one space, then the target.
 *
 * - a path target is the project-relative path, or only the basename when the path is outside
 *   the project; a path whose basename is `.memlog.md` has no step at all (its text is `run:note`);
 * - `Bash` shows the program name and nothing after it, `WebFetch` the host and nothing else;
 * - a tool the table does not list is its own name, with nothing of its input;
 * - control characters are stripped, the label is at most 48 characters, and a path is cut from
 *   the left, any other target from the right.
 */

/** The longest label. */
export const LABEL_MAX = 48

/** The most of the one watched field the fold keeps while it streams; past it the target is dropped. */
export const FIELD_BUFFER_MAX = 1024

type Entry = { verb: string; field?: string; kind?: 'path' | 'program' | 'host' | 'word' }

const TABLE: Readonly<Record<string, Entry>> = {
  Read: { verb: 'read', field: 'file_path', kind: 'path' },
  Write: { verb: 'write', field: 'file_path', kind: 'path' },
  Edit: { verb: 'edit', field: 'file_path', kind: 'path' },
  MultiEdit: { verb: 'edit', field: 'file_path', kind: 'path' },
  NotebookEdit: { verb: 'edit', field: 'notebook_path', kind: 'path' },
  Bash: { verb: 'run', field: 'command', kind: 'program' },
  Skill: { verb: 'skill', field: 'skill', kind: 'word' },
  Agent: { verb: 'agent', field: 'subagent_type', kind: 'word' },
  Task: { verb: 'agent', field: 'subagent_type', kind: 'word' },
  WebFetch: { verb: 'fetch', field: 'url', kind: 'host' },
  Grep: { verb: 'grep' },
  Glob: { verb: 'glob' },
  WebSearch: { verb: 'web search' }
}

// Own-property lookup: a tool called `constructor` or `__proto__` is unlisted, not a table entry.
function entryOf(tool: string): Entry | undefined {
  return Object.prototype.hasOwnProperty.call(TABLE, tool) ? TABLE[tool] : undefined
}

// C0 and C1 controls, and the characters that hide or reorder text: zero-width and direction marks,
// line and paragraph separators, bidi embeddings and overrides, invisible operators, the byte-order mark.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g

function stripped(text: string): string {
  return text.replace(CONTROL, '')
}

/** Whether only the first part of the tool's field is needed, so a longer one is cut at the buffer and not dropped. */
export function keepsHeadOfField(tool: string): boolean {
  return entryOf(tool)?.kind === 'program'
}

/** The one input field a tool's label reads, or `undefined` when it reads none. */
export function labelFieldOf(tool: string): string | undefined {
  return entryOf(tool)?.field
}

/** A program name: the first word of a command after any leading `NAME=value` words, as its basename. */
function programOf(command: string): string | undefined {
  // Split on whitespace first, so a tab or a newline between words is a boundary and not a deletion.
  const words = command.split(/\s+/).map(stripped).filter((word) => word !== '')
  let at = 0
  while (at < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[at])) {
    // A quoted value may hold spaces, so the words after it are part of it: no program can be told from them.
    if (/^[A-Za-z_][A-Za-z0-9_]*=['"]/.test(words[at])) return undefined
    at += 1
  }
  const word = words[at]
  if (word === undefined) return undefined
  const program = posix.basename(word)
  return /^[A-Za-z0-9._+-]+$/.test(program) ? program : undefined
}

/** The host of a URL: no scheme, port, credentials or path. */
function hostOf(url: string): string | undefined {
  try {
    const host = new URL(stripped(url).trim()).hostname
    return host === '' ? undefined : host
  } catch {
    return undefined
  }
}

/** The mark of a cut label, written as its code point: it is a data mark, never copy a window draws as words. */
const CUT = '\u2026'

/** `text` held to `room` characters (code points), cut from the left or the right with an ellipsis. */
function fitted(text: string, room: number, from: 'left' | 'right'): string {
  const chars = Array.from(text)
  if (chars.length <= room) return text
  if (room <= 1) return room === 1 ? CUT : ''
  return from === 'left' ? `${CUT}${chars.slice(chars.length - (room - 1)).join('')}` : `${chars.slice(0, room - 1).join('')}${CUT}`
}

function joined(verb: string, target: string | undefined, from: 'left' | 'right'): string {
  if (target === undefined || target === '') return fitted(verb, LABEL_MAX, 'right')
  const room = LABEL_MAX - Array.from(verb).length - 1
  // A verb that leaves no room for a target stands alone.
  return room < 2 ? fitted(verb, LABEL_MAX, 'right') : `${verb} ${fitted(target, room, from)}`
}

/**
 * The label of a call, or `undefined` when the call raises no step (a path whose basename is the
 * memlog). `field` is the decoded text of the tool's one watched field, or `undefined` when it never
 * arrived whole or overran the buffer: the label is then the verb alone.
 */
export function stepLabel(tool: string, field: string | undefined, projectRoot: string): string | undefined {
  const entry = entryOf(tool)
  if (entry === undefined) {
    const name = stripped(tool).trim()
    return fitted(name === '' ? 'tool' : name, LABEL_MAX, 'right')
  }
  const text = field === undefined ? undefined : stripped(field)
  switch (entry.kind) {
    case 'path': {
      const raw = text?.trim()
      if (raw === undefined || raw === '') return joined(entry.verb, undefined, 'left')
      if (posix.basename(raw) === MEMLOG) return undefined
      const target = projectRelative(raw, projectRoot) ?? posix.basename(raw)
      return joined(entry.verb, target === '' || target === '.' ? undefined : target, 'left')
    }
    case 'program':
      return joined(entry.verb, field === undefined ? undefined : programOf(field), 'right')
    case 'host':
      return joined(entry.verb, text === undefined ? undefined : hostOf(text), 'right')
    case 'word':
      return joined(entry.verb, text?.trim(), 'right')
    default:
      return joined(entry.verb, undefined, 'right')
  }
}
