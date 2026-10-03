import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { TranscriptFile, TranscriptRecord } from '../../../shared/conversation'
import { errnoOf } from '../errno'

/**
 * Where a project's transcript lives and how it is read and written. The one
 * thing persisted (FR16, FR100, NFR2): `{version, projectPath, entries}` JSON at
 * `<userData>/conversations/<sha256(projectPath) hex>.json`, and nothing else.
 *
 * Reading never throws, and it says what it found: no file at all is `missing`,
 * and everything else that is not a whole transcript is told apart, as
 * `unreadable` (with the errno), `corrupt` (not JSON, not this project's, not a
 * transcript's shape) or `unknown-version`. A file with some records that are
 * not records is `loaded` with those left out and counted. Nothing here repairs
 * or deletes a file: a file that cannot be used whole is moved aside by
 * `setAsideTranscript` before anything writes, so no later write replaces it.
 *
 * Writing is synchronous and atomic — a temporary file beside the target, then a
 * rename — so a reader never meets half a file, and it reports instead of
 * throwing. Neither touches a path inside the project root.
 */

export const TRANSCRIPT_VERSION = 1

/** The file a project's transcript is kept in, under the app's own data directory. */
export function transcriptFilePath(userDataDir: string, projectPath: string): string {
  const key = createHash('sha256').update(projectPath).digest('hex')
  return join(userDataDir, 'conversations', `${key}.json`)
}

/** The path as the file system sees it: the deepest part that exists, resolved through links. */
function realish(path: string): string {
  const absolute = resolve(path)
  const missing: string[] = []
  let probe = absolute
  while (!existsSync(probe)) {
    const parent = dirname(probe)
    if (parent === probe) {
      return absolute
    }
    // The last segment whole, including when the parent is the root, whose own
    // name is not one character longer than its length.
    missing.unshift(basename(probe))
    probe = parent
  }
  try {
    return join(realpathSync.native(probe), ...missing)
  } catch {
    return absolute
  }
}

/** Whether `target` is the project root or lies beneath it. */
export function isInsideProject(projectPath: string, target: string): boolean {
  const from = realish(projectPath)
  const to = realish(target)
  const between = relative(from, to)
  // A step out is `..` alone or `..` then a separator; a directory named `..cache` is still inside.
  return (
    between === '' ||
    (between !== '..' && !between.startsWith(`..${sep}`) && !isAbsolute(between))
  )
}

function isRecord(value: unknown): value is TranscriptRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (
    typeof record.id !== 'string' ||
    typeof record.text !== 'string' ||
    typeof record.at !== 'number' ||
    !Number.isFinite(record.at)
  ) {
    return false
  }
  if (record.kind === 'user' || record.kind === 'sysline') return true
  return (
    record.kind === 'persona' &&
    typeof record.agentId === 'string' &&
    typeof record.messageId === 'string'
  )
}

/** What reading a project's file found. */
export type LoadOutcome =
  /** There is no file: nothing was ever stored, which is not a problem. */
  | { kind: 'missing' }
  /** A transcript. `dropped` counts the records in it that were not records and are left out. */
  | { kind: 'loaded'; entries: TranscriptRecord[]; dropped: number }
  /** The file could not be read: the errno code. */
  | { kind: 'unreadable'; errno: string }
  /** Not JSON, not an object, not this project's, or without its entries. */
  | { kind: 'corrupt' }
  /** A transcript of a version this build does not write. */
  | { kind: 'unknown-version' }

/** What a project's file holds, and, when it is not a whole transcript, which way it is not. */
export function loadTranscript(filePath: string, projectPath: string): LoadOutcome {
  // A path inside the project is never looked at: there is no file of the harness's there, and
  // the write that follows says why it cannot make one.
  if (isInsideProject(projectPath, filePath)) {
    return { kind: 'missing' }
  }
  let text: string
  try {
    text = readFileSync(filePath, 'utf8')
  } catch (error) {
    return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
      ? { kind: 'missing' }
      : { kind: 'unreadable', errno: errnoOf(error, 'UNKNOWN') }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { kind: 'corrupt' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'corrupt' }
  }
  const file = parsed as Partial<Record<keyof TranscriptFile, unknown>>
  if (file.version !== TRANSCRIPT_VERSION) {
    return typeof file.version === 'number' ? { kind: 'unknown-version' } : { kind: 'corrupt' }
  }
  if (file.projectPath !== projectPath || !Array.isArray(file.entries)) {
    return { kind: 'corrupt' }
  }
  const entries = file.entries.filter(isRecord)
  return { kind: 'loaded', entries, dropped: file.entries.length - entries.length }
}

export type AsideOutcome = { ok: true; to: string } | { ok: false; errno: string }

/**
 * Move a project's file out of the way, to a name beside it that nothing reads
 * and nothing overwrites, so the next write starts a file of its own. Nothing is
 * copied or deleted: it is the same file under another name. A file inside the
 * project root is not touched.
 */
export function setAsideTranscript(filePath: string, projectPath: string): AsideOutcome {
  if (isInsideProject(projectPath, filePath)) {
    return { ok: false, errno: 'inside-project' }
  }
  try {
    let to = `${filePath}.aside`
    for (let n = 2; existsSync(to); n += 1) {
      to = `${filePath}.aside-${n}`
    }
    renameSync(filePath, to)
    return { ok: true, to }
  } catch (error) {
    return { ok: false, errno: errnoOf(error, 'UNKNOWN') }
  }
}

export type WriteOutcome = { ok: true } | { ok: false; errno: string }

/** Replace a project's file with `entries`: the errno code when it could not, never a throw. */
export function writeTranscript(
  filePath: string,
  projectPath: string,
  entries: readonly TranscriptRecord[]
): WriteOutcome {
  if (isInsideProject(projectPath, filePath)) {
    return { ok: false, errno: 'inside-project' }
  }
  const temporary = `${filePath}.${process.pid}.tmp`
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    const file: TranscriptFile = {
      version: TRANSCRIPT_VERSION,
      projectPath,
      entries: [...entries]
    }
    writeFileSync(temporary, JSON.stringify(file))
    renameSync(temporary, filePath)
    return { ok: true }
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {
      // Nothing was left to remove.
    }
    return { ok: false, errno: errnoOf(error, 'UNKNOWN') }
  }
}
