import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { HarnessError, InstallReply, InstallSnapshot } from '../shared/install'
import { createInstallProjection } from './projections/install'
import type { InstallProjection } from './projections/install'
import { createInstallSource } from './sources/install/resolvers'
import type { InstallSource } from './sources/install/resolvers'
import { createPrerequisiteChecks } from './sources/preflight/tools'
import type { PrerequisiteChecks } from './sources/preflight/tools'
import { watchInstall } from './sources/install/watch-install'
import type { InstallWatcher } from './sources/install/watch-install'
import { projectPathForWebContents } from './windows/main-window'

/**
 * The two channels behind the preload's two install methods. Exported so
 * tests/bridge-contract.test.ts can tie them to the preload's own literals.
 */
export const INSTALL_GET_CHANNEL = 'install:get'
export const INSTALL_CHANGED_CHANNEL = 'install:changed'

/** The parts of a `WebContents` the bridge touches. */
type Sender = {
  id: number
  send(channel: string, snapshot: InstallSnapshot): void
  isDestroyed(): boolean
  once(event: 'destroyed', listener: () => void): unknown
}

export type InstallBridgeDeps = {
  projectPathFor?: (webContentsId: number) => string | undefined
  createSource?: (projectRoot: string) => InstallSource
  createChecks?: () => PrerequisiteChecks
  watch?: (options: { projectRoot: string; onChange: () => void }) => InstallWatcher
  writeDiagnostic?: (line: string) => void
}

type Service = { projection: InstallProjection; watcher: InstallWatcher; ready: Promise<void> }

function failure(error: HarnessError): InstallReply {
  return { ok: false, error }
}

/**
 * Answer `install:get`, and push `install:changed` whenever the answer changes.
 *
 * The service for a window is built on the renderer's first ask rather than
 * when the window opens: install state belongs to the window's project, the
 * renderer asks on mount, and a reload finds the projection already warm. It
 * also keeps launching a window from spawning anything by itself.
 */
export function registerInstallBridge(deps: InstallBridgeDeps = {}): void {
  const projectPathFor = deps.projectPathFor ?? projectPathForWebContents
  const createSource = deps.createSource ?? ((projectRoot) => createInstallSource({ projectRoot }))
  const createChecks = deps.createChecks ?? (() => createPrerequisiteChecks())
  const watch = deps.watch ?? watchInstall
  const writeDiagnostic =
    deps.writeDiagnostic ?? ((line: string) => void process.stderr.write(`${line}\n`))

  const services = new Map<number, Service>()

  function serviceFor(sender: Sender, projectRoot: string): Service {
    const existing = services.get(sender.id)
    if (existing !== undefined) {
      return existing
    }

    const projection = createInstallProjection({
      source: createSource(projectRoot),
      checks: createChecks(),
      onChange: (snapshot) => {
        if (!sender.isDestroyed()) {
          sender.send(INSTALL_CHANGED_CHANNEL, snapshot)
        }
      },
      onDiagnostic: writeDiagnostic
    })
    const watcher = watch({ projectRoot, onChange: () => void projection.refresh() })
    const service = { projection, watcher, ready: projection.refresh() }
    services.set(sender.id, service)

    sender.once('destroyed', () => {
      projection.dispose()
      void watcher.close()
      services.delete(sender.id)
    })
    return service
  }

  ipcMain.handle(INSTALL_GET_CHANNEL, async (event: IpcMainInvokeEvent): Promise<InstallReply> => {
    const sender = event.sender as unknown as Sender
    const projectRoot = projectPathFor(sender.id)
    if (projectRoot === undefined) {
      return failure({
        code: 'install/no-project',
        message: 'install · no project is open for this window'
      })
    }
    try {
      const service = serviceFor(sender, projectRoot)
      await service.ready
      return { ok: true, snapshot: service.projection.snapshot() }
    } catch (error) {
      const name = error instanceof Error ? error.constructor.name : 'unknown'
      // The cause is for the developer's terminal only; the reply carries the
      // class name and nothing else.
      writeDiagnostic(
        `install/unexpected · ${error instanceof Error ? error.message : String(error)}`
      )
      return failure({
        code: 'install/unexpected',
        message: 'install · unexpected failure',
        detail: name
      })
    }
  })
}
