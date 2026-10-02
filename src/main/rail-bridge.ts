import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { ContractEvent } from '../shared/events'
import type { HarnessError } from '../shared/install'
import type { ArtifactObservation, RailReply, RailSnapshot } from '../shared/rail'
import { personaProjectionFor } from './persona-states'
import { createRailProjection } from './projections/rail'
import type { RailProjection } from './projections/rail'
import { watchArtifacts } from './sources/project/watch-artifacts'
import type { ArtifactWatcher } from './sources/project/watch-artifacts'
import { projectPathForWebContents } from './windows/main-window'

/**
 * The two channels behind the preload's two rail methods. Exported so
 * tests/bridge-contract.test.ts can tie them to the preload's own literals.
 */
export const RAIL_GET_CHANNEL = 'rail:get'
export const RAIL_CHANGED_CHANNEL = 'rail:changed'

/** The parts of a `WebContents` the bridge touches. */
type Sender = {
  id: number
  /** A rail snapshot on its own channel, and the window's `persona:state` on the session one. */
  send(channel: string, payload: RailSnapshot | ContractEvent): void
  isDestroyed(): boolean
  once(event: 'destroyed', listener: () => void): unknown
}

export type RailBridgeDeps = {
  projectPathFor?: (webContentsId: number) => string | undefined
  watch?: (options: {
    projectRoot: string
    onObservation: (observation: ArtifactObservation) => void
    onError: (error: unknown) => void
  }) => ArtifactWatcher
  writeDiagnostic?: (line: string) => void
  /** The projection's clock and quiet window, for a test that holds them still. */
  now?: () => number
  quietMs?: number
}

type Service = { projection: RailProjection; watcher: ArtifactWatcher; ready: Promise<void> }

function failure(error: HarnessError): RailReply {
  return { ok: false, error }
}

/**
 * Answer `rail:get`, and push `rail:changed` whenever the rows change.
 *
 * Built on the same pattern as the install bridge: the service for a window is
 * made on the renderer's first ask, so launching a window starts no watcher by
 * itself, and a reload finds the projection warm. The reply waits for the
 * initial scan, so the first snapshot is the project as it stands.
 */
export function registerRailBridge(deps: RailBridgeDeps = {}): void {
  const projectPathFor = deps.projectPathFor ?? projectPathForWebContents
  const watch = deps.watch ?? watchArtifacts
  const writeDiagnostic =
    deps.writeDiagnostic ?? ((line: string) => void process.stderr.write(`${line}\n`))

  const services = new Map<number, Service>()

  function serviceFor(sender: Sender, projectRoot: string): Service {
    const existing = services.get(sender.id)
    if (existing !== undefined) {
      return existing
    }

    const personas = personaProjectionFor(sender, deps.now)
    const projection = createRailProjection({
      onChange: (snapshot) => {
        if (!sender.isDestroyed()) {
          sender.send(RAIL_CHANGED_CHANNEL, snapshot)
        }
        personas.apply({ name: 'rail:changed', payload: snapshot })
      },
      ...(deps.now !== undefined ? { now: deps.now } : {}),
      ...(deps.quietMs !== undefined ? { quietMs: deps.quietMs } : {})
    })
    const watcher = watch({
      projectRoot,
      onObservation: (observation) => projection.observe(observation),
      onError: (error) =>
        writeDiagnostic(`rail/watch · ${error instanceof Error ? error.message : String(error)}`)
    })
    const service = {
      projection,
      watcher,
      ready: watcher.ready.then(() => {
        projection.ready()
        // The first snapshot is the baseline for `note`: the files as they stand
        // are not a change, and it is taken before any push can follow it.
        personas.seedRail(projection.snapshot())
      })
    }
    services.set(sender.id, service)

    sender.once('destroyed', () => {
      projection.dispose()
      void watcher.close()
      services.delete(sender.id)
    })
    return service
  }

  ipcMain.handle(RAIL_GET_CHANNEL, async (event: IpcMainInvokeEvent): Promise<RailReply> => {
    const sender = event.sender as unknown as Sender
    const projectRoot = projectPathFor(sender.id)
    if (projectRoot === undefined) {
      return failure({
        code: 'rail/no-project',
        message: 'rail · no project is open for this window'
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
      writeDiagnostic(`rail/unexpected · ${error instanceof Error ? error.message : String(error)}`)
      return failure({
        code: 'rail/unexpected',
        message: 'rail · unexpected failure',
        detail: name
      })
    }
  })
}
