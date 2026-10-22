import { BrowserWindow, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { CHANGES_CHANGED_CHANNEL, CHANGES_GET_CHANNEL } from '../shared/channels'
import type { ChangesBody, ChangesReply } from '../shared/changes'
import {
  defaultProjectPathFor,
  defaultWriteDiagnostic,
  noProject,
  senderOf,
  sendTo,
  unexpected
} from './bridge-kit'
import type { Sender } from './bridge-kit'
import { forgetChanges, rememberChanges } from './changes-model'
import { createChangesProjection } from './projections/changes'
import type { ChangesProjection, ChangesTimers } from './projections/changes'

/**
 * The two channels behind the preload's `getChanges` / `onChangesChanged`.
 * Exported so tests/bridge-contract.test.ts can tie them to the preload's own literals.
 */
export { CHANGES_CHANGED_CHANNEL, CHANGES_GET_CHANNEL }

/** What front and back mean for a window: told at once if it is already in front. */
export type FrontListeners = { onFront: () => void; onBack: () => void }

export type ChangesBridgeDeps = {
  projectPathFor?: (webContentsId: number) => string | undefined
  /** How a window's Changes are read; the source and the fold by default. */
  read?: (projectRoot: string) => Promise<ChangesBody>
  /** Hears the sender's window come to the front and go to the back; returns the way to stop. */
  subscribeFront?: (sender: Sender, listeners: FrontListeners) => () => void
  timers?: ChangesTimers
  writeDiagnostic?: (line: string) => void
}

/**
 * The default: the sender's own window's `focus` and `blur`. A window already
 * focused is in front now, so `onFront` is called at once. A focused document
 * window is the project window's blur, so it counts as background.
 */
function subscribeWindowFront(sender: Sender, { onFront, onBack }: FrontListeners): () => void {
  const window = BrowserWindow.fromWebContents(sender as unknown as WebContents)
  if (window === null) {
    return () => {}
  }
  window.on('focus', onFront)
  window.on('blur', onBack)
  if (window.isFocused()) {
    onFront()
  }
  return () => {
    if (!window.isDestroyed()) {
      window.removeListener('focus', onFront)
      window.removeListener('blur', onBack)
    }
  }
}

/**
 * Answer `changes:get`, and push `changes:changed` whenever what git reports
 * differs (Story 9.3, AD-31). The service for a window is built on its first
 * ask, so opening a window spawns nothing by itself, and it reads only while the
 * window is in front. Each snapshot is remembered for the document bridge's
 * second admission (AD-13 amended).
 */
export function registerChangesBridge(deps: ChangesBridgeDeps = {}): void {
  const projectPathFor = deps.projectPathFor ?? defaultProjectPathFor
  const subscribeFront = deps.subscribeFront ?? subscribeWindowFront
  const writeDiagnostic = deps.writeDiagnostic ?? defaultWriteDiagnostic

  const services = new Map<number, ChangesProjection>()

  function serviceFor(sender: Sender, projectRoot: string): ChangesProjection {
    const existing = services.get(sender.id)
    if (existing !== undefined) {
      return existing
    }
    const projection = createChangesProjection({
      projectRoot,
      ...(deps.read === undefined ? {} : { read: deps.read }),
      ...(deps.timers === undefined ? {} : { timers: deps.timers }),
      onChange: (snapshot) => {
        rememberChanges(sender.id, snapshot)
        sendTo(sender, CHANGES_CHANGED_CHANNEL, snapshot)
      }
    })
    services.set(sender.id, projection)
    rememberChanges(sender.id, projection.snapshot())

    const unsubscribe = subscribeFront(sender, {
      onFront: () => projection.front(),
      onBack: () => projection.back()
    })

    sender.once('destroyed', () => {
      unsubscribe()
      projection.dispose()
      forgetChanges(sender.id)
      services.delete(sender.id)
    })
    return projection
  }

  ipcMain.handle(CHANGES_GET_CHANNEL, (event: IpcMainInvokeEvent): ChangesReply => {
    const sender = senderOf(event)
    const projectRoot = projectPathFor(sender.id)
    if (projectRoot === undefined) {
      return noProject('changes')
    }
    try {
      return { ok: true, snapshot: serviceFor(sender, projectRoot).snapshot() }
    } catch (error) {
      return unexpected('changes', error, writeDiagnostic)
    }
  })
}
