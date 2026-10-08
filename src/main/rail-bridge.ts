import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { RAIL_CHANGED_CHANNEL, RAIL_GET_CHANNEL } from '../shared/channels'
import type { OutputFolderFacts } from '../shared/output-folder'
import type { ArtifactObservation, RailReply } from '../shared/rail'
import {
  defaultProjectPathFor,
  defaultWriteDiagnostic,
  noProject,
  senderOf,
  sendTo,
  unexpected
} from './bridge-kit'
import { fixedOutputFolder } from './output-folder-model'
import type { FolderView, OutputFolderHandle } from './output-folder-model'
import { personaProjectionFor } from './persona-states'
import { railAnnotatorFor } from './rail-annotations'
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
  /**
   * A window's output folder (Story 5.4): which folder of the project to watch,
   * and when that moves. Left out, the install's own folder and nothing that
   * resolves or stores anything.
   */
  outputFolder?: (sender: Sender, projectRoot: string) => OutputFolderHandle
  watch?: (options: {
    projectRoot: string
    folder: string
    awaiting?: string
    onObservation: (observation: ArtifactObservation) => void
    onFolderChange?: () => void
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

/** One folder's projection and the watcher that feeds it. */
type Live = { projection: RailProjection; watcher: ArtifactWatcher; folder: string; awaiting: string | undefined }

type Service = { live: Live | undefined; ready: Promise<void> }

/** What a view says of the folder, without what only the watcher needs or what rides apart. */
function factsOf(view: FolderView): OutputFolderFacts {
  return {
    folder: view.folder,
    ...(view.bmadFolder === undefined ? {} : { bmadFolder: view.bmadFolder }),
    ...(view.chosen === undefined ? {} : { chosen: view.chosen }),
    ...(view.state === undefined ? {} : { state: view.state })
  }
}

/**
 * Answer `rail:get`, and push `rail:changed` whenever the rows change.
 *
 * Built on the same pattern as the install bridge: the service for a window is
 * made on the renderer's first ask, so launching a window starts no watcher by
 * itself, and a reload finds the projection warm. The reply waits for the
 * initial scan, so the first snapshot is the project as it stands.
 *
 * The window's output folder says which folder is watched (Story 5.4). When it
 * moves the bridge scans the new folder with a watcher and a projection of its
 * own, and only when that scan is done swaps them in, so the old rows stay until
 * the new ones are there and one snapshot carries the folder, the head's facts
 * and the rows. The swap touches nothing live: the annotator is bound to the new
 * projection, the persona states take the new rows as their baseline (a change
 * of folder is not a change of an owned file), and no session, run, transcript
 * or open document window hears of it.
 */
export function registerRailBridge(deps: RailBridgeDeps = {}): void {
  const projectPathFor = deps.projectPathFor ?? defaultProjectPathFor
  const outputFolder = deps.outputFolder ?? (() => fixedOutputFolder())
  const watch = deps.watch ?? watchArtifacts
  const writeDiagnostic = deps.writeDiagnostic ?? defaultWriteDiagnostic

  const services = new Map<number, Service>()

  function serviceFor(sender: Sender, projectRoot: string): Service {
    const existing = services.get(sender.id)
    if (existing !== undefined) {
      return existing
    }

    const handle = outputFolder(sender, projectRoot)
    const personas = personaProjectionFor(sender, deps.now)
    // The stream's side of the rows: what the window's runs say is handed to the
    // projection, again after each observation of the path it is about.
    const annotator = railAnnotatorFor(sender)
    const service: Service = { live: undefined, ready: Promise.resolve() }
    let candidate: Live | undefined
    let generation = 0
    let gone = false

    /** A projection and a watcher for one view of the folder. The watcher starts scanning at once. */
    function begin(view: FolderView): Live {
      const projection = createRailProjection({
        onChange: (snapshot) => {
          sendTo(sender, RAIL_CHANGED_CHANNEL, snapshot)
          personas.apply({ name: 'rail:changed', payload: snapshot })
        },
        facts: factsOf(view),
        ...(view.refusal === undefined ? {} : { refusal: view.refusal }),
        ...(deps.now !== undefined ? { now: deps.now } : {}),
        ...(deps.quietMs !== undefined ? { quietMs: deps.quietMs } : {})
      })
      const watcher = watch({
        projectRoot,
        folder: view.folder,
        ...(view.awaiting === undefined ? {} : { awaiting: view.awaiting }),
        onObservation: (observation) => {
          projection.observe(observation)
          annotator.observed(observation.path)
          deps.observeArtifact?.(sender, projectRoot, observation)
        },
        // The folder was removed, or the one awaited has come: resolve it again.
        onFolderChange: () => void handle.refresh(),
        onError: (error) =>
          writeDiagnostic(`rail/watch · ${error instanceof Error ? error.message : String(error)}`)
      })
      return { projection, watcher, folder: view.folder, awaiting: view.awaiting }
    }

    function discard(live: Live): void {
      live.projection.dispose()
      void live.watcher.close()
    }

    function first(view: FolderView): Promise<void> {
      // The window went while the folder was being resolved: nothing is started, so nothing is left open.
      if (gone) {
        return Promise.resolve()
      }
      const started = begin(view)
      service.live = started
      annotator.bind(started.projection)
      return started.watcher.ready.then(() => {
        started.projection.ready()
        // The first snapshot is the baseline for `note`: the files as they stand
        // are not a change, and it is taken before any push can follow it.
        personas.seedRail(started.projection.snapshot())
      })
    }

    /** The folder's view moved: say what changed of it, or move the rail to another folder. */
    async function follow(view: FolderView): Promise<void> {
      await service.ready.catch(() => {})
      const current = service.live
      if (gone || current === undefined) {
        return
      }
      const watching = (live: Live): boolean => live.folder === view.folder && live.awaiting === view.awaiting
      if (candidate !== undefined && watching(candidate)) {
        candidate.projection.setFacts(factsOf(view), view.refusal)
        return
      }
      if (watching(current)) {
        // What is watched is as it was: a scan in flight for another folder is no longer wanted.
        if (candidate !== undefined) {
          generation += 1
          discard(candidate)
          candidate = undefined
        }
        current.projection.setFacts(factsOf(view), view.refusal)
        return
      }

      const token = ++generation
      if (candidate !== undefined) {
        discard(candidate)
      }
      const next = begin(view)
      candidate = next
      await next.watcher.ready.catch(() => {})
      if (token !== generation || gone) {
        // Superseded, or the window went: whoever did that has discarded this one.
        return
      }
      candidate = undefined
      // The annotator first, while the projection is not ready, so nothing is
      // pushed on its own; then the baseline, as one snapshot of a later revision.
      annotator.bind(next.projection)
      next.projection.ready(current.projection.snapshot().revision)
      const snapshot = next.projection.snapshot()
      personas.rebaseRail(snapshot)
      service.live = next
      discard(current)
      sendTo(sender, RAIL_CHANGED_CHANNEL, snapshot)
    }

    const known = handle.view()
    service.ready = known !== undefined ? first(known) : handle.refresh().then(first)
    services.set(sender.id, service)
    const unsubscribe = handle.subscribe((view) => void follow(view))
    // A scan that never began is a service that never was: the next ask starts again.
    service.ready.catch(() => {
      unsubscribe()
      if (services.get(sender.id) === service) {
        services.delete(sender.id)
      }
    })

    sender.once('destroyed', () => {
      gone = true
      unsubscribe()
      if (service.live !== undefined) {
        discard(service.live)
      }
      if (candidate !== undefined) {
        discard(candidate)
      }
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
      if (service.live === undefined) {
        return noProject('rail')
      }
      return { ok: true, snapshot: service.live.projection.snapshot() }
    } catch (error) {
      return unexpected('rail', error, writeDiagnostic)
    }
  })
}
