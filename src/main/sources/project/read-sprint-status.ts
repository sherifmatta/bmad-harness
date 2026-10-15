import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SprintStatusRead } from '../../../shared/board'
import { errnoOf } from '../errno'

/**
 * The one file the Board reads (Story 6.2): the project's `sprint-status.yaml`,
 * under the output folder's `implementation-artifacts/`. It is opened here and
 * nowhere else; the rail's watcher still only stats. Nothing is written, and
 * what could not be read is said as an errno name and never a path.
 */

/** The two files the Board draws from, project-relative and POSIX, under an output folder with its trailing `/`. */
export function boardPaths(folder: string): { sprintStatus: string; epics: string } {
  return {
    sprintStatus: `${folder}implementation-artifacts/sprint-status.yaml`,
    epics: `${folder}planning-artifacts/epics.md`
  }
}

/** The directory the Board lists to find a story's or epic's file, project-relative and POSIX, with its trailing `/`. */
export const artifactsDirOf = (folder: string): string => `${folder}implementation-artifacts/`

/** The file's text, or why there is none: absent (`ENOENT`) or unreadable for any other reason. Never rejects. */
export async function readSprintStatus(projectRoot: string, folder: string): Promise<SprintStatusRead> {
  try {
    return { state: 'text', text: await readFile(join(projectRoot, boardPaths(folder).sprintStatus), 'utf8') }
  } catch (error) {
    const errno = errnoOf(error)
    return errno === 'ENOENT' || errno === 'ENOTDIR' ? { state: 'absent' } : { state: 'unreadable', errno }
  }
}

/**
 * The names of the files directly in `<folder>implementation-artifacts/`, for the Board to find a story's
 * or epic's file by number (Story 7.1). A listing only: nothing is opened or written, a directory is left
 * out, and any failure is `[]`. Never rejects.
 */
export async function readArtifactNames(projectRoot: string, folder: string): Promise<string[]> {
  try {
    const entries = await readdir(join(projectRoot, artifactsDirOf(folder)), { withFileTypes: true })
    return entries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}
