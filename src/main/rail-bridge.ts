import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { RAIL_CHANGED_CHANNEL, RAIL_GET_CHANNEL } from '../shared/channels'
import type { ArtifactObservation, RailReply } from '../shared/rail'
import {
  defaultProjectPathFor,
  defaultWriteDiagnostic,
  noProject,
  senderOf,
  sendTo,
  unexpected
} from './bridge-kit'
import { personaProjectionFor } from './persona-states'
import { createRailProjection } from './projections/rail'
import type { RailProjection } from './projections/rail'
import type { Sender } from './bridge-kit'
import { watchArtifacts } from './sources/project/watch-artifacts'
import type { ArtifactWatcher } from './sources/project/watch-artifacts'

/**
 * The two channels behind the preload's two rail methods. Exported so
 * tests/bridge-contract.test.ts can tie them to the preload's own literals.
 */
export { RAIL_CHANGED_CHANNEL, RAIL_GET_CHANNEL }

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
  /**
   * Told every observation the watcher makes, after the rail has it, so the
   * session side can read a changed `.memlog.md` for a run's notes. Optional:
   * the rail is complete without it.
   */
  observeArtifact?: (sender: Sender, projectRoot: string, observation: ArtifactObservation) => void
}

type Service = { projection: RailProjection; watcher: ArtifactWatcher; ready: Promise<void> }

/**
 * Answer `rail:get`, and push `rail:changed` whenever the rows change.
 *
 * Built on the same pattern as the install bridge: the service for a window is
 * made on the renderer's first ask, so launching a window starts no watcher by
 * itself, and a reload finds the projection warm. The reply waits for the
 * initial scan, so the first snapshot is the project as it stands.
 */
export function registerRailBridge(deps: RailBridgeDeps = {}): void {
  const projectPathFor = deps.projectPathFor ?? defaultProjectPathFor
  const watch = deps.watch ?? watchArtifacts
  const writeDiagnostic = deps.writeDiagnostic ?? defaultWriteDiagnostic

  const services = new Map<number, Service>()

  function serviceFor(sender: Sender, projectRoot: string): Service {
    const existing = services.get(sender.id)
    if (existing !== undefined) {
      return existing
    }

    const personas = personaProjectionFor(sender, deps.now)
    const projection = createRailProjection({
      onChange: (snapshot) => {
        sendTo(sender, RAIL_CHANGED_CHANNEL, snapshot)
        personas.apply({ name: 'rail:changed', payload: snapshot })
      },
      ...(deps.now !== undefined ? { now: deps.now } : {}),
      ...(deps.quietMs !== undefined ? { quietMs: deps.quietMs } : {})
    })
    const watcher = watch({
      projectRoot,
      onObservation: (observation) => {
        projection.observe(observation)
        deps.observeArtifact?.(sender, projectRoot, observation)
      },
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
    const sender = senderOf(event)
    const projectRoot = projectPathFor(sender.id)
    if (projectRoot === undefined) {
      return noProject('rail')
    }
    try {
      const service = serviceFor(sender, projectRoot)
      await service.ready
      return { ok: true, snapshot: service.projection.snapshot() }
    } catch (error) {
      return unexpected('rail', error, writeDiagnostic)
    }
  })
}
