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
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { TranscriptFile, TranscriptRecord } from '../../../shared/conversation'
import { errnoOf } from '../errno'

/**
 * Where a project's transcript lives and how it is read and written. The one
 * thing persisted (FR16, FR100, NFR2): `{version, projectPath, entries}` JSON at
 * `<userData>/conversations/<sha256(projectPath) hex>.json`, and nothing else.
 *
 * Reading never throws and never repairs: an absent, unreadable, corrupt,
 * wrong-version or foreign file is an empty transcript and is left as it lies
 * until the next write replaces it. Writing is synchronous and atomic — a
 * temporary file beside the target, then a rename — so a reader never meets half
 * a file, and it reports instead of throwing. Neither touches a path inside the
 * project root.
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
    missing.unshift(probe.slice(parent.length + 1))
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

/** The records a project's file holds, or none when there is no usable file. */
export function loadTranscript(filePath: string, projectPath: string): TranscriptRecord[] {
  if (isInsideProject(projectPath, filePath)) {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const file = parsed as Partial<Record<keyof TranscriptFile, unknown>>
  if (
    file.version !== TRANSCRIPT_VERSION ||
    file.projectPath !== projectPath ||
    !Array.isArray(file.entries) ||
    !file.entries.every(isRecord)
  ) {
    return []
  }
  return file.entries
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
