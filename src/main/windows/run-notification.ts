import { posix } from 'node:path'
import { BrowserWindow, Notification } from 'electron'
import type { WebContents } from 'electron'
import { RUN_REVEALED_CHANNEL } from '../../shared/channels'
import type { RunStatus } from '../../shared/conversation'
import type { ContractEvent } from '../../shared/events'
import { sectionCount } from '../../shared/section-progress'
import { sendTo } from '../bridge-kit'
import type { Sender } from '../bridge-kit'
import { subjectOf } from '../fold/run-card'
import type { RunKit } from '../session-run'

/**
 * Told once, quietly, when the user is elsewhere (FR93, FR94). A run that
 * takes twelve minutes ends while the user is deliberately in another window;
 * the card and the rail say so, but only to someone looking at them. This is
 * the one place the harness speaks outside its window, and the one place in
 * `src` that names the OS's banner API: every other file is swept for it.
 *
 * - **When.** On `run:finished`, `run:stopped` or `run:failed` alone, with the
 *   session's own project window unfocused at the moment the event is told. A
 *   focused window posts nothing: the card already reports it, and a banner
 *   would be a second source of truth. No other event posts, ever.
 * - **What.** One line of facts in the harness register, `·`-separated, in the
 *   body: the persona's roster name (else its agent id; nothing with no agent),
 *   the subject document's file name, the outcome word the card holds, and the
 *   subject's confirmed section count through the one shared spelling. The file
 *   and the count go together: a run that wrote nothing names no file. Nothing
 *   guides: no "ready", no "next", no "review".
 * - **How.** Silent, shown once, no sound, no badge, no Dock, no permission
 *   call: macOS asks once on its own the first time, and a refusal makes
 *   `show()` a no-op, which is the behaviour asked for. Nothing is queued,
 *   debounced or held across a quit. Concurrent sessions each post their own.
 * - **Activation.** The project window is restored if minimized, shown and
 *   focused, and the run's id goes to that window alone on `run:revealed`, so
 *   the thread scrolls to the run's card. Nothing else: no persona switch, no
 *   document window, no command. A window that has since closed means nothing.
 *
 * Everything that touches Electron is injectable and touched only when a
 * terminal event is told or the banner is activated, never at construction:
 * the composition root builds this where the electron mock of its own test
 * has no banner API at all.
 */

/** The parts of the project window this reads when the event is told, and raises when the line is activated. */
export type RunWindow = Pick<BrowserWindow, 'isDestroyed' | 'isFocused' | 'isMinimized' | 'restore' | 'show' | 'focus'>

/** What is posted: the one line in the body, silent, and nothing else. */
export type CompletionOptions = { body: string; silent: true }

/** The posted line as this module holds it: shown once, and heard when the user activates it. */
export type Posted = {
  show(): void
  on(event: 'click', listener: () => void): unknown
}

/** Hears each run event a window is told, with the run's card as main then holds it (`session-run`'s `told`). */
export type Told = NonNullable<RunKit['told']>

export type RunNotifierDeps = {
  /** A persona's roster name in the window with this id, or `undefined`; the real one reads main's install model. */
  agentName: (webContentsId: number, agentId: string) => string | undefined
  /** One diagnostic line, without its newline. */
  writeDiagnostic: (line: string) => void
  /** The sender's own window, or `null`; the default asks Electron. */
  windowOf?: (sender: Sender) => RunWindow | null
  /** Make the line; the default constructs the OS banner. */
  post?: (options: CompletionOptions) => Posted
  /** Whether this OS can show one; the default asks Electron. */
  isSupported?: () => boolean
}

/** The three events a run can end on, and the only three this module hears. */
const TERMINAL: ReadonlySet<ContractEvent['name']> = new Set(['run:finished', 'run:stopped', 'run:failed'])

/**
 * The one line: `<Persona> · <file> · <outcome> · <N sections>`. The persona is
 * left out with no name, and the file and the count leave together when the
 * run has no subject, so a run that wrote nothing reads `John · failed`.
 */
export function completionLine({
  name,
  path,
  outcome,
  sections
}: {
  name: string | undefined
  path: string | undefined
  outcome: Exclude<RunStatus, 'running'>
  sections: number | undefined
}): string {
  const parts: string[] = []
  if (name !== undefined) parts.push(name)
  if (path !== undefined) parts.push(posix.basename(path))
  parts.push(outcome)
  if (path !== undefined && sections !== undefined) parts.push(sectionCount(sections))
  return parts.join(' · ')
}

export function createRunNotifier(deps: RunNotifierDeps): { told: Told } {
  const windowOf = deps.windowOf ?? ((sender) => BrowserWindow.fromWebContents(sender as unknown as WebContents))
  const post = deps.post ?? ((options) => new Notification(options))
  const isSupported = deps.isSupported ?? (() => Notification.isSupported())

  return {
    told(sender, event, card) {
      if (!TERMINAL.has(event.name) || card === undefined || card.status === 'running') return
      // A window that is going has no one to tell, and asking Electron for its window may throw.
      if (sender.isDestroyed()) return
      // Nothing here may throw out of the event the window is being told: the rest of the teardown follows it.
      try {
        const window = windowOf(sender)
        // "The window" is the session's own project window; a document window over it is elsewhere.
        if (window === null || window.isDestroyed() || window.isFocused()) return
        if (!isSupported()) return

        const { runId } = card
        // A persona's run is named by the persona; a skill-first session's (Story 7.5) by its skill; any other has none.
        const name =
          card.agentId === undefined ? card.skill : (deps.agentName(sender.id, card.agentId) ?? card.agentId)
        const subject = subjectOf(card.documents)
        const body = completionLine({
          name,
          path: subject?.path,
          outcome: card.status,
          sections: subject?.sections.length
        })
        const posted = post({ body, silent: true })
        posted.on('click', () => {
          if (window.isDestroyed()) return
          if (window.isMinimized()) window.restore()
          window.show()
          window.focus()
          sendTo(sender, RUN_REVEALED_CHANNEL, runId)
        })
        posted.show()
      } catch (error) {
        deps.writeDiagnostic(`run/completion · ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}
