import type { HarnessError } from './install'

/**
 * The output folder contract (Story 5.4): which folder of a project the rail
 * watches for the files BMad writes, and what crosses the bridge about it. Types
 * and one constant, like `rail.ts`: Bridge is the one layer every side may import.
 *
 * Two folders were one. The BMad install (its configuration and resolver
 * scripts) is fixed by BMad's installer; the *output* folder is chosen by BMad's
 * own configuration and, as an override, by the user. This is about the second.
 * A folder is project-relative, POSIX, and spelled with a trailing `/`.
 */

/** The output folder when nothing says another: where BMad's installer puts it. */
export const DEFAULT_OUTPUT_FOLDER = '_bmad/'

/**
 * Why a chosen folder was refused, as the head says it after `not changed · `.
 * Closed: the reason is the harness's own words and never a path.
 */
export type ChooseRefusal =
  | 'outside this project'
  | 'the project folder itself'
  | 'inside .git'
  | 'inside node_modules'

/**
 * What the head says beneath the folder, apart from a refusal:
 * - `different`: the user's choice is not BMad's own folder (`bmad writes to · <bmad folder>`);
 * - `missing`: the chosen folder is gone, remembered and not applied (`<chosen> · folder missing`).
 * Absent when there is nothing to say.
 */
export type OutputFolderState = 'different' | 'missing'

/**
 * What the folder resolution says, which is also what the rail's snapshot
 * carries so the rows and the head land in one frame. `folder` is the folder
 * watched; `bmadFolder` is BMad's own when it is known; `chosen` is the user's
 * stored choice while there is one (even a missing one).
 */
export type OutputFolderFacts = {
  folder: string
  bmadFolder?: string
  chosen?: string
  state?: OutputFolderState
}

/**
 * A refusal, held in main until the next choice. `seq` rises with every refusal
 * so a second, identical one is told and announced again.
 */
export type OutputFolderRefusal = { reason: ChooseRefusal; seq: number }

/** What a request to choose a folder came to. */
export type ChooseOutcome =
  | { kind: 'chosen' }
  | { kind: 'cancelled' }
  | { kind: 'refused'; reason: ChooseRefusal }

/** The reply to the request to choose a folder: what it came to, or the envelope saying why not. */
export type OutputFolderReply = { ok: true; outcome: ChooseOutcome } | { ok: false; error: HarnessError }

/** What the head says, and the window announces once, of a refused choice. */
export function refusalLine(refusal: OutputFolderRefusal): string {
  return `not changed · ${refusal.reason}`
}

/** The head's state line for a snapshot's facts, or `undefined` when it has nothing to say. */
export function stateLineOf(
  facts: OutputFolderFacts,
  refusal?: OutputFolderRefusal
): string | undefined {
  if (refusal !== undefined) {
    return refusalLine(refusal)
  }
  if (facts.state === 'missing' && facts.chosen !== undefined) {
    return `${facts.chosen} · folder missing`
  }
  if (facts.state === 'different' && facts.bmadFolder !== undefined) {
    return `bmad writes to · ${facts.bmadFolder}`
  }
  return undefined
}

/** The full path of the output folder, as the empty state names it beneath its sentence: the project's path and the folder, with no trailing slash. */
export function folderPathOf(projectPath: string, folder: string): string {
  return [projectPath, ...folder.split('/').filter((segment) => segment !== '')].join('/')
}
