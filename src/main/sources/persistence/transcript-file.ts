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
import type {
  RunCardStep,
  StoredRun,
  StoredSkillSession,
  TranscriptFile,
  TranscriptRecord
} from '../../../shared/conversation'
import { MAX_STEPS } from '../../../shared/run-steps'
import { isPlainSkillName } from '../../../shared/run-skill'
import { isStoredMention } from '../../../shared/stored-mention'
import { errnoOf } from '../errno'

/**
 * Where a project's transcript lives and how it is read and written. The one
 * thing persisted (FR16, FR100, NFR2): `{version, projectPath, entries, runs?, attributed?}`
 * JSON at `<userData>/conversations/<sha256(projectPath) hex>.json`, and nothing
 * else. `skillSessions` (Story 7.5) is the list of skill-first sessions, additive
 * in the same way: a file from before it loads as having none. `attributed` (Story 8.1) is set by every write
 * and tells a later read that the one-time attribution of records to personas has been done. `runs` are the run cards that stand beside the entries, each with the
 * moment of its last event (`StoredRun`); a file from before they were kept has
 * none, and loads as having none, at the same version.
 *
 * Reading never throws, and it says what it found: no file at all is `missing`,
 * and everything else that is not a whole transcript is told apart, as
 * `unreadable` (with the errno), `corrupt` (not JSON, not this project's, not a
 * transcript's shape) or `unknown-version`. A file with some records, or some
 * run cards, that are not what they should be is `loaded` with those left out
 * and counted. Nothing here repairs or deletes a file: a file that cannot be
 * used whole is moved aside by `setAsideTranscript` before anything writes, so no
 * later write replaces it.
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
  // The room's flag is `true` or not there at all: a record that says otherwise is not one this build wrote.
  if (record.room !== undefined && record.room !== true) return false
  // A skill-first session's flag is its session id or not there at all (Story 7.5).
  if (record.skillSession !== undefined && typeof record.skillSession !== 'string') return false
  // A persona thread's tag is an agent id or not there at all (Story 8.1); on a user turn or a harness line,
  // anything else is not a record this build wrote.
  if (
    (record.kind === 'user' || record.kind === 'sysline') &&
    record.agentId !== undefined &&
    typeof record.agentId !== 'string'
  ) {
    return false
  }
  // A persona record's activation flag is `true` or not there at all (Story 8.3).
  if (record.kind === 'persona' && record.activation !== undefined && record.activation !== true) return false
  if (record.kind === 'user' || record.kind === 'sysline') return true
  if (record.kind === 'skill') {
    return typeof record.messageId === 'string' && typeof record.skillSession === 'string'
  }
  return (
    record.kind === 'persona' &&
    typeof record.agentId === 'string' &&
    typeof record.messageId === 'string'
  )
}

/**
 * A record as it is kept in memory: a `mention` is the user's typed `@name` and nothing else, so on a record that is
 * not a user's, or that is not text, the field is left out and the record loads as a plain one (AD-25).
 */
function withoutBadMention(record: TranscriptRecord): TranscriptRecord {
  const held = record as TranscriptRecord & { mention?: unknown }
  if (held.mention === undefined) {
    return record
  }
  if (isStoredMention(held, held.mention)) {
    return record
  }
  const plain: Record<string, unknown> = { ...held }
  delete plain.mention
  return plain as TranscriptRecord
}

/** Whether a listed skill-first session is what it should be: its id, its plain skill name and when it started. */
function isStoredSkillSession(value: unknown): value is StoredSkillSession {
  if (typeof value !== 'object' || value === null) return false
  const { sessionId, skill, at } = value as Record<string, unknown>
  return typeof sessionId === 'string' && isPlainSkillName(skill) && typeof at === 'number' && Number.isFinite(at)
}

const RUN_STATUSES: ReadonlySet<unknown> = new Set(['running', 'finished', 'stopped', 'failed'])

/** Whether a stored run is a run card with the moment of its last event: the fields a card is drawn from. */
function isStoredRun(value: unknown): value is StoredRun {
  if (typeof value !== 'object' || value === null) return false
  const { card, lastAt } = value as Record<string, unknown>
  if (typeof lastAt !== 'number' || !Number.isFinite(lastAt)) return false
  if (typeof card !== 'object' || card === null) return false
  const held = card as Record<string, unknown>
  return (
    typeof held.runId === 'string' &&
    typeof held.sessionId === 'string' &&
    typeof held.code === 'string' &&
    typeof held.startedAt === 'number' &&
    Number.isFinite(held.startedAt) &&
    RUN_STATUSES.has(held.status) &&
    Array.isArray(held.notes) &&
    Array.isArray(held.documents)
  )
}

const STEP_STATUSES: ReadonlySet<unknown> = new Set(['running', 'done', 'failed'])

const isEpoch = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Whether a stored step is one a card holds: its call, label, status, instants and count of notes before it. */
function isStoredStep(value: unknown): value is RunCardStep {
  if (typeof value !== 'object' || value === null) return false
  const step = value as Record<string, unknown>
  return (
    typeof step.callId === 'string' &&
    typeof step.label === 'string' &&
    STEP_STATUSES.has(step.status) &&
    isEpoch(step.startedAt) &&
    (step.endedAt === undefined || isEpoch(step.endedAt)) &&
    typeof step.notesBefore === 'number' &&
    Number.isInteger(step.notesBefore) &&
    step.notesBefore >= 0
  )
}

/**
 * A stored run as it is kept in memory: its `steps` are the well-formed ones, at most `MAX_STEPS`. A card
 * from before steps were kept, and one whose `steps` is not a list, load with none; neither is damage to count.
 */
function withSteps(stored: StoredRun): StoredRun {
  const held: unknown = (stored.card as { steps?: unknown }).steps
  const steps = Array.isArray(held) ? held.filter(isStoredStep).slice(-MAX_STEPS) : []
  return { ...stored, card: { ...stored.card, steps } }
}

/**
 * A stored run as it is kept in memory: a `skill` that is not a plain bounded name (a hand-edited file, a
 * value of the wrong type) is left off and the card kept, so the head can never carry free text (AD-24).
 */
function withSkill(stored: StoredRun): StoredRun {
  const held: unknown = (stored.card as { skill?: unknown }).skill
  if (held === undefined || isPlainSkillName(held)) return stored
  const card: Record<string, unknown> = { ...stored.card }
  delete card.skill
  return { ...stored, card: card as StoredRun['card'] }
}

/** What reading a project's file found. */
export type LoadOutcome =
  /** There is no file: nothing was ever stored, which is not a problem. */
  | { kind: 'missing' }
  /**
   * A transcript. `dropped` counts the records and run cards in it that were not
   * what they should be and are left out.
   */
  | {
      kind: 'loaded'
      entries: TranscriptRecord[]
      runs: StoredRun[]
      skillSessions: StoredSkillSession[]
      dropped: number
      /**
       * Set when the file carried the `attributed` marker (Story 8.1): its records were already attributed to
       * their personas, once, and are never attributed again. Absent for a file written before it.
       */
      attributed?: true
    }
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
  // The skill-first sessions first: a record that flags a session the list does not hold could never be removed, so it is left out.
  const listed: unknown[] = Array.isArray(file.skillSessions) ? file.skillSessions : []
  const valid = listed.filter(isStoredSkillSession)
  const skillSessions = valid.filter((item, at) => valid.findIndex((other) => other.sessionId === item.sessionId) === at)
  const listedIds = new Set(skillSessions.map(({ sessionId }) => sessionId))
  const entries = file.entries
    .filter(isRecord)
    .filter((record) => !('skillSession' in record) || record.skillSession === undefined || listedIds.has(record.skillSession))
    .map(withoutBadMention)
  // No `runs` is a file from before they were kept; a `runs` that is not a list is damage.
  const stored: unknown[] = Array.isArray(file.runs) ? file.runs : []
  const runs = stored.filter(isStoredRun).map(withSteps).map(withSkill)
  const damaged = file.runs === undefined || Array.isArray(file.runs) ? 0 : 1
  // The same for the skill-first sessions: none is a file from before them, a value that is not a list is damage.
  const skillsDamaged = file.skillSessions === undefined || Array.isArray(file.skillSessions) ? 0 : 1
  return {
    kind: 'loaded',
    entries,
    runs,
    skillSessions,
    ...(file.attributed === true ? { attributed: true as const } : {}),
    dropped:
      file.entries.length -
      entries.length +
      stored.length -
      runs.length +
      damaged +
      listed.length -
      skillSessions.length +
      skillsDamaged
  }
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

/** Replace a project's file with `entries`, `runs` and `skillSessions`: the errno code when it could not, never a throw. */
export function writeTranscript(
  filePath: string,
  projectPath: string,
  entries: readonly TranscriptRecord[],
  runs: readonly StoredRun[] = [],
  skillSessions: readonly StoredSkillSession[] = []
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
      entries: [...entries],
      // Every write of this build says the records in it have been through attribution (Story 8.1).
      attributed: true,
      // A file with no run cards is the file it always was.
      ...(runs.length === 0 ? {} : { runs: [...runs] }),
      // Nor does a file with no skill-first sessions hold the field.
      ...(skillSessions.length === 0 ? {} : { skillSessions: [...skillSessions] })
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
