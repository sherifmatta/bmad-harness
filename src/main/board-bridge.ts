import { join } from 'node:path'
import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { BOARD_CHANGED_CHANNEL, BOARD_GET_CHANNEL } from '../shared/channels'
import type { BoardReply, SprintStatusRead } from '../shared/board'
import { DEFAULT_OUTPUT_FOLDER } from '../shared/output-folder'
import type { ArtifactObservation } from '../shared/rail'
import { defaultProjectPathFor, defaultWriteDiagnostic, noProject, senderOf, sendTo, unexpected } from './bridge-kit'
import type { Sender } from './bridge-kit'
import { titlesOf } from './fold/epic-titles'
import { foldSprintStatus } from './fold/sprint-status'
import { fixedOutputFolder } from './output-folder-model'
import type { OutputFolderHandle } from './output-folder-model'
import { createBoardProjection } from './projections/board'
import type { BoardProjection } from './projections/board'
import { artifactsDirOf, boardPaths, readArtifactNames, readSprintStatus } from './sources/project/read-sprint-status'
import { readText } from './sources/project/read-text'

/**
 * The two channels behind the preload's two Board methods. Exported so
 * tests/bridge-contract.test.ts can tie them to the preload's own literals.
 */
export { BOARD_CHANGED_CHANNEL, BOARD_GET_CHANNEL }

export type BoardBridgeDeps = {
  projectPathFor?: (webContentsId: number) => string | undefined
  /** A window's output folder, which says where the two files are. Left out, the install's own folder. */
  outputFolder?: (sender: Sender, projectRoot: string) => OutputFolderHandle
  /** Opens `sprint-status.yaml`, and nothing else. */
  read?: (projectRoot: string, folder: string) => Promise<SprintStatusRead>
  /** Lists the file names directly in `<folder>implementation-artifacts/`, so a story's or epic's file can be found by number. */
  readNames?: (projectRoot: string, folder: string) => Promise<string[]>
  /** Reads `epics.md` for the titles; `undefined` when it cannot be read. */
  readTitles?: (absolutePath: string) => Promise<string | undefined>
  writeDiagnostic?: (line: string) => void
  /** How long writes must be quiet before the file is read again, so a burst is one reading. */
  quietMs?: number
}

export type BoardBridge = {
  /**
   * Told every observation the rail's watcher makes. The watcher only stats, so
   * this is how the Board learns that one of its two files was written, added or
   * removed; it opens nothing the observation names but those two.
   */
  observeArtifact(sender: Sender, projectRoot: string, observation: ArtifactObservation): void
}

type Service = { ready: Promise<void>; projection: BoardProjection; folder: () => string; schedule: () => void }

const QUIET_MS = 100

/** The names `board-files.ts` can resolve, directly in `implementation-artifacts/`. */
const FILE_NAME = /^(?:spec-\d+-\d+-[^/]+|epic-\d+-context)\.md$/

/**
 * Answer `board.get`, and push `board:changed` once per revision of what
 * `sprint-status.yaml` comes to (Story 6.2).
 *
 * Built on the rail bridge's pattern: a window's service is made on its first
 * ask, so launching a window reads nothing by itself, and a reload finds the
 * projection warm. The file is read once per change of it, in main, and every
 * Board region draws from that one reading. A file absent now and written later
 * fills the snapshot with no restart, because the rail's watcher already sees the
 * folder it will appear in.
 */
export function registerBoardBridge(deps: BoardBridgeDeps = {}): BoardBridge {
  const projectPathFor = deps.projectPathFor ?? defaultProjectPathFor
  const outputFolder = deps.outputFolder ?? (() => fixedOutputFolder())
  const read = deps.read ?? readSprintStatus
  const readNames = deps.readNames ?? readArtifactNames
  const readTitles = deps.readTitles ?? readText
  const writeDiagnostic = deps.writeDiagnostic ?? defaultWriteDiagnostic
  const quietMs = deps.quietMs ?? QUIET_MS

  const services = new Map<number, Service>()

  function serviceFor(sender: Sender, projectRoot: string): Service {
    const existing = services.get(sender.id)
    if (existing !== undefined) {
      return existing
    }

    const handle = outputFolder(sender, projectRoot)
    const projection = createBoardProjection({ onChange: (snapshot) => sendTo(sender, BOARD_CHANGED_CHANNEL, snapshot) })
    const folder = (): string => handle.view()?.folder ?? DEFAULT_OUTPUT_FOLDER
    let gone = false
    let timer: NodeJS.Timeout | null = null
    let loading: Promise<void> | undefined
    let dirty = false

    async function load(): Promise<void> {
      try {
        const where = folder()
        const sprint = await read(projectRoot, where)
        // The titles are read only when there is a file to title.
        const epics = sprint.state === 'text' ? await readTitles(join(projectRoot, boardPaths(where).epics)) : undefined
        // The listing is read beside them; a failure of it is no files, never a failed Board.
        const names = sprint.state === 'text' ? await readNames(projectRoot, where).catch((): string[] => []) : []
        if (!gone) {
          projection.apply(foldSprintStatus(sprint, titlesOf(epics), { dir: artifactsDirOf(where), names }))
        }
      } catch (error) {
        writeDiagnostic(`board/read · ${error instanceof Error ? error.message : String(error)}`)
        // A window with no reading yet is told there is none, never that it has no project.
        if (!gone && projection.snapshot() === undefined) {
          projection.apply(foldSprintStatus({ state: 'unreadable', errno: 'failed' }))
        }
      }
    }

    /** One reading at a time; a change that comes during one is read after it. */
    function request(): Promise<void> {
      if (loading !== undefined) {
        dirty = true
        return loading
      }
      loading = (async () => {
        try {
          do {
            dirty = false
            await load()
          } while (dirty && !gone)
        } finally {
          loading = undefined
        }
      })()
      return loading
    }

    function schedule(): void {
      if (gone) {
        return
      }
      if (timer !== null) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        timer = null
        void request()
      }, quietMs)
    }

    // The folder moves, or what is said of it does: both files are read again, and the body says if anything changed.
    const unsubscribe = handle.subscribe(schedule)
    const service: Service = {
      ready: (handle.view() === undefined ? handle.refresh().then(() => undefined) : Promise.resolve()).then(request),
      projection,
      folder,
      schedule
    }
    services.set(sender.id, service)
    // A start that never finished is a service that never was: the next ask starts again.
    service.ready.catch(() => {
      unsubscribe()
      if (services.get(sender.id) === service) {
        services.delete(sender.id)
      }
    })

    sender.once('destroyed', () => {
      gone = true
      unsubscribe()
      if (timer !== null) {
        clearTimeout(timer)
      }
      services.delete(sender.id)
    })
    return service
  }

  ipcMain.handle(BOARD_GET_CHANNEL, async (event: IpcMainInvokeEvent): Promise<BoardReply> => {
    const sender = senderOf(event)
    const projectRoot = projectPathFor(sender.id)
    if (projectRoot === undefined) {
      return noProject('board')
    }
    try {
      const service = serviceFor(sender, projectRoot)
      await service.ready
      const snapshot = service.projection.snapshot()
      return snapshot === undefined ? noProject('board') : { ok: true, snapshot }
    } catch (error) {
      return unexpected('board', error, writeDiagnostic)
    }
  })

  return {
    observeArtifact(sender, _projectRoot, observation) {
      const service = services.get(sender.id)
      if (service === undefined) {
        return
      }
      const paths = boardPaths(service.folder())
      const artifacts = artifactsDirOf(service.folder())
      // Only a name that can be a story's or an epic's file changes what the Board resolves.
      const inArtifacts = observation.path.startsWith(artifacts) && FILE_NAME.test(observation.path.slice(artifacts.length))
      if (observation.path === paths.sprintStatus || observation.path === paths.epics || inArtifacts) {
        service.schedule()
      }
    }
  }
}
