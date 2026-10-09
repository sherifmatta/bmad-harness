import type { AgentView } from '../../../shared/install'

/**
 * Where `@<name>` at the start of a composer message hands the conversation, if
 * anywhere. Pure, and made only of the roster's own display names: it reads
 * nothing but `AgentView.name`, so a skill, a menu entry or an agent id can
 * never be what an `@` means.
 *
 * The token is what follows the `@` up to the first whitespace, and it must be
 * at the very start of the trimmed message. It resolves only when it matches,
 * ignoring case, exactly one persona other than the current one. Anything else
 * (no match, two personas of that name, the current persona, an `@` mid-text) is
 * not a handoff: the caller sends the message as typed, to the current persona,
 * with no refusal and no hint.
 */
export type HandoffTarget = {
  /** The persona to hand the work to. */
  agent: AgentView
  /** What follows the `@<name>` token, trimmed; empty for a pure handoff. */
  text: string
  /** The `@<name>` token exactly as typed, case kept: shown beside `text`, never sent to the persona. */
  mention: string
}

export function handoffTarget(
  message: string,
  agents: readonly AgentView[],
  currentId: string
): HandoffTarget | null {
  const trimmed = message.trim()
  if (!trimmed.startsWith('@')) {
    return null
  }
  const token = /^@(\S*)/.exec(trimmed)?.[1] ?? ''
  if (token === '') {
    return null
  }
  const wanted = token.toLowerCase()
  const matches = agents.filter(
    (agent) => agent.id !== currentId && agent.name.trim().toLowerCase() === wanted
  )
  if (matches.length !== 1) {
    return null
  }
  return { agent: matches[0], text: trimmed.slice(1 + token.length).trim(), mention: `@${token}` }
}
