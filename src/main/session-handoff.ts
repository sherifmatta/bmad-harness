import type { SyslineRecord } from '../shared/conversation'
import type { AgentId } from '../shared/ids'
import type { Sender } from './bridge-kit'
import type { TranscriptRegistry } from './projections/transcript'
import type { Service } from './session-registry'

/**
 * Whether an open that succeeded was a handoff, and if so the sysline it wrote.
 * It was one when the transcript already has an entry and the window's last
 * opened persona is a different one. The line is `handed to <Name>` and nothing
 * more: it names no files and no skill, since a tile click or an `@name` carries
 * neither. A persona the roster does not name (either side) is not announced,
 * and the open itself is unchanged. Either way this open is
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
    const toName = nameOf(sender.id, agentId)
    if (nameOf(sender.id, from) === undefined || toName === undefined) {
      return undefined
    }
    return transcript.recordSysline(`handed to ${toName}`, now())
  }
}
