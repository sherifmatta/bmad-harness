import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { readBranch } from './sources/project/branch'
import { projectPathForWebContents } from './windows/main-window'

/**
 * The channel behind the preload's `getBranch`. Exported so
 * tests/bridge-contract.test.ts can tie it to the preload's own literal.
 */
export const PROJECT_BRANCH_CHANNEL = 'project:branch'

export type ProjectBridgeDeps = {
  readBranch?: (projectRoot: string) => Promise<string | null>
  projectPathFor?: (webContentsId: number) => string | undefined
}

/**
 * Answer `project:branch` for the asking window's own project: the branch, or
 * `null` for anything else — an unknown window, not a repository, an
 * unrecognised HEAD. The handler is lazy: registering it reads and starts
 * no process, and it never throws to the renderer or replies with a path.
 */
export function registerProjectBridge(deps: ProjectBridgeDeps = {}): void {
  const read = deps.readBranch ?? ((projectRoot: string) => readBranch(projectRoot))
  const projectPathFor = deps.projectPathFor ?? projectPathForWebContents

  ipcMain.handle(
    PROJECT_BRANCH_CHANNEL,
    async (event: IpcMainInvokeEvent): Promise<string | null> => {
      const projectRoot = projectPathFor(event.sender.id)
      if (projectRoot === undefined) {
        return null
      }
      try {
        return await read(projectRoot)
      } catch {
        return null
      }
    }
  )
}
