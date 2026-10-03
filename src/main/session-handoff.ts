import type { SyslineRecord } from '../shared/conversation'
import type { AgentId } from '../shared/ids'
import type { Sender } from './bridge-kit'
import type { TranscriptRegistry } from './projections/transcript'
import type { Service } from './session-registry'

/**
 * Whether an open that succeeded was a handoff, and if so the sysline it wrote.
 * It was one when the transcript already has an entry and the window's last
 * opened persona is a different one; that persona is `from`, and the files it
 * wrote are what the new one picks up from. A persona the roster does not name
 * is not announced, and the open itself is unchanged. Either way this open is
 * now the last one.
 */

export type HandoffComposerDeps = {
  transcripts: TranscriptRegistry
  /** A persona's display name from main's install model, for one window. */
  nameOf: (webContentsId: number, agentId: string) => string | undefined
  now: () => number
}

export function createHandoffComposer(deps: HandoffComposerDeps) {
  const { transcripts, nameOf, now } = deps

  return function handoffFor(
    sender: Sender,
    service: Service,
    projectRoot: string,
    agentId: AgentId
  ): SyslineRecord | undefined {
    const from = service.lastOpened
    service.lastOpened = agentId
    if (from === undefined || from === agentId) {
      return undefined
    }
    const transcript = transcripts.forProject(projectRoot)
    if (transcript.entries().length === 0) {
      return undefined
    }
    const fromName = nameOf(sender.id, from)
    const toName = nameOf(sender.id, agentId)
    if (fromName === undefined || toName === undefined) {
      return undefined
    }
    const files = service.written.get(from) ?? []
    const text =
      `handed off · ${fromName} → ${toName}` +
      (files.length === 0 ? '' : ` · picking up from ${files.join(', ')}`)
    return transcript.recordSysline(text, now())
  }
}
