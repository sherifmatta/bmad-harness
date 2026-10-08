import { isAbsolute, posix, relative, sep } from 'node:path'
import { DEFAULT_OUTPUT_FOLDER } from '../../shared/output-folder'
import type { ChooseRefusal, OutputFolderFacts } from '../../shared/output-folder'

/**
 * Which folder of a project the rail watches for its output (Story 5.4), as a
 * rule over three things with no I/O: the user's stored choice, BMad's own
 * `output_folder`, and what is on disk. The first usable of:
 *
 * 1. the user's choice for this project, when its folder exists inside the
 *    project (it is an override, offered and never prompted);
 * 2. BMad's `core.output_folder` from its resolved configuration, when that
 *    folder exists inside the project;
 * 3. the default folder (`DEFAULT_OUTPUT_FOLDER`), which is always usable.
 *
 * It is total: whatever is stored or resolved, however wrong, yields a folder,
 * and nothing in it is an error to show. A stored choice whose folder is gone is
 * kept and said (`state: 'missing'`) and not applied; one that cannot be used at
 * all reads as no choice. The rail's head is built from what it returns.
 */

/** What is on disk at a project-relative folder, as the caller found it. */
export type DiskState = 'usable' | 'missing' | 'unusable'

/** A folder not yet there, whose arrival would change the answer: the watcher listens for it. */
export type FolderResolution = OutputFolderFacts & { awaiting?: string }

/** The folders that are never an output folder, nor inside one. */
const REFUSED_NAMES = new Set(['.git', 'node_modules'])

/**
 * A project-relative folder as the harness spells it: POSIX, no leading or
 * doubled slash, no `.` or `..` segment, a trailing `/`. `null` for anything
 * that is not one of those: not a string, empty, absolute, a backslash or NUL,
 * the project itself, a way out of it, or `.git`/`node_modules` or inside either.
 */
export function normalizeFolder(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '' || raw.includes('\\') || /[\u0000-\u001f\u007f]/.test(raw)) {
    return null
  }
  if (raw.startsWith('/')) {
    return null
  }
  const segments = raw.split('/').filter((segment) => segment !== '' && segment !== '.')
  if (segments.length === 0 || segments.some((s) => s === '..' || REFUSED_NAMES.has(s))) {
    return null
  }
  return `${segments.join('/')}/`
}

/**
 * BMad's `output_folder` as a project-relative folder. The value is a template
 * with `{project-root}` where the project goes; it names a folder inside the
 * project, or it is unusable (`null`): a folder outside the project, the project
 * itself and anything `normalizeFolder` refuses.
 */
export function bmadFolderOf(raw: string, projectRoot: string): string | null {
  const filled = raw.split('{project-root}').join(projectRoot)
  if (!filled.startsWith('/')) {
    return normalizeFolder(filled)
  }
  const inside = posix.relative(projectRoot, posix.normalize(filled))
  return inside === '' || inside === '..' || inside.startsWith('../') ? null : normalizeFolder(inside)
}

/**
 * The folder a project's rail watches, and what is to be said of it.
 *
 * `stored` is whatever the store holds for the project and is read tolerantly;
 * `bmad` is BMad's own folder when it is known, as `bmadFolderOf` gives it, and
 * `undefined` when the resolver failed or said nothing; `onDisk` is how a
 * folder stands (the caller checks real paths).
 */
export function resolveOutputFolder({
  stored,
  bmad,
  onDisk
}: {
  stored: unknown
  bmad: string | null | undefined
  onDisk: (folder: string) => DiskState
}): FolderResolution {
  const known = bmad ?? undefined
  const bmadDisk = known === undefined ? undefined : onDisk(known)
  // Where the rail looks when the choice cannot be applied.
  const base = known !== undefined && bmadDisk === 'usable' ? known : DEFAULT_OUTPUT_FOLDER
  const bmadFacts = known === undefined ? {} : { bmadFolder: known }

  const chosen = normalizeFolder(stored) ?? undefined
  const chosenDisk = chosen === undefined ? undefined : onDisk(chosen)

  if (chosen !== undefined && chosenDisk === 'usable') {
    return {
      folder: chosen,
      chosen,
      ...bmadFacts,
      ...(known !== undefined && known !== chosen ? { state: 'different' as const } : {})
    }
  }
  if (chosen !== undefined && chosenDisk === 'missing') {
    return {
      folder: base,
      chosen,
      ...bmadFacts,
      state: 'missing',
      ...(chosen !== base ? { awaiting: chosen } : {})
    }
  }
  return {
    folder: base,
    ...bmadFacts,
    ...(known !== undefined && bmadDisk === 'missing' && known !== base ? { awaiting: known } : {})
  }
}

/**
 * Whether a folder the user picked may become the output folder, judged on real
 * paths (a link out of the project is its target): inside the project's real
 * path, not the project itself, and not `.git` or `node_modules` or inside
 * either. A refusal is the harness's own words.
 */
export function checkChoice(
  realProject: string,
  realTarget: string
): { ok: true; folder: string } | { ok: false; reason: ChooseRefusal } {
  const inside = relative(realProject, realTarget)
  if (inside === '') {
    return { ok: false, reason: 'the project folder itself' }
  }
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    return { ok: false, reason: 'outside this project' }
  }
  const segments = inside.split(sep)
  if (segments.includes('.git')) {
    return { ok: false, reason: 'inside .git' }
  }
  if (segments.includes('node_modules')) {
    return { ok: false, reason: 'inside node_modules' }
  }
  return { ok: true, folder: `${segments.join('/')}/` }
}

/** A value of any shape as a record, or `null`. */
function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Every choice a store holds, read tolerantly: the entries of a `folders` object
 * whose values are strings, and nothing else. A store of any other shape holds
 * none, and the next write replaces it whole.
 */
export function storedChoices(raw: unknown): Record<string, string> {
  const folders = recordOf(recordOf(raw)?.folders)
  const kept: Record<string, string> = {}
  for (const [key, value] of Object.entries(folders ?? {})) {
    if (typeof value === 'string') {
      kept[key] = value
    }
  }
  return kept
}

/** The folder stored for a project, as the store holds it (not yet judged), or `undefined`. */
export function choiceFor(raw: unknown, projectKey: string): string | undefined {
  const choices = storedChoices(raw)
  return Object.hasOwn(choices, projectKey) ? choices[projectKey] : undefined
}

/** The choices with one project's set to `folder`, or removed for `null`; the others untouched. */
export function withChoice(raw: unknown, projectKey: string, folder: string | null): Record<string, string> {
  const choices = storedChoices(raw)
  delete choices[projectKey]
  return folder === null ? choices : { ...choices, [projectKey]: folder }
}
