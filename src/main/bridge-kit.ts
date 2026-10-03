import type { IpcMainInvokeEvent } from 'electron'
import type { HarnessError } from '../shared/install'
import { projectPathForWebContents } from './windows/main-window'

/**
 * What every bridge repeats: the failure envelope, the `<x>/no-project` and
 * `<x>/unexpected` replies, the guarded send to a window and the two defaults
 * a bridge takes from the app (which project a window holds, where a
 * diagnostic goes). Each bridge still registers its own `ipcMain.handle`, so
 * what a bridge answers is read where it is registered.
 */

/** The parts of a `WebContents` a bridge touches. */
export type Sender = {
  id: number
  send(channel: string, payload: unknown): void
  isDestroyed(): boolean
  once(event: 'destroyed', listener: () => void): unknown
}

/** The window an IPC call came from, as the bridge sees it. */
export function senderOf(event: IpcMainInvokeEvent): Sender {
  return event.sender as unknown as Sender
}

/** Send to a window that is still there; a destroyed one hears nothing. */
export function sendTo(sender: Pick<Sender, 'send' | 'isDestroyed'>, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) {
    sender.send(channel, payload)
  }
}

export function failure(error: HarnessError): { ok: false; error: HarnessError } {
  return { ok: false, error }
}

/** The reply to a window that holds no project: `<prefix>/no-project`. */
export function noProject(prefix: string): { ok: false; error: HarnessError } {
  return failure({
    code: `${prefix}/no-project`,
    message: `${prefix} · no project is open for this window`
  })
}

/**
 * Anything a handler did not expect. The cause goes to the developer's
 * terminal only; the reply carries the class name and nothing else.
 */
export function unexpected(
  prefix: string,
  error: unknown,
  writeDiagnostic: (line: string) => void
): { ok: false; error: HarnessError } {
  const name = error instanceof Error ? error.constructor.name : 'unknown'
  writeDiagnostic(`${prefix}/unexpected · ${error instanceof Error ? error.message : String(error)}`)
  return failure({
    code: `${prefix}/unexpected`,
    message: `${prefix} · unexpected failure`,
    detail: name
  })
}

/** The default for a bridge's `projectPathFor` dependency. */
export const defaultProjectPathFor = projectPathForWebContents

/** The default for a bridge's `writeDiagnostic` dependency: one line on stderr. */
export function defaultWriteDiagnostic(line: string): void {
  void process.stderr.write(`${line}\n`)
}
