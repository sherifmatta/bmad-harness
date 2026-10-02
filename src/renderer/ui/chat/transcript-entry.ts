import type { AgentView } from '../../../shared/install'

/**
 * What a transcript is made of — types only, apart from the components that
 * draw them, so the folds that build a transcript can be read (and run in
 * node) without a stylesheet or a component in reach.
 */

/** Who the user is to the transcript: a name, and what it says under it. */
export type UserIdentity = { name: string; title: string }

export type PersonaEntry = {
  kind: 'persona'
  id: string
  at: number
  agent: AgentView
  text: string
  /** The model's id for the message these words belong to, when a session gave one. */
  messageId?: string
}

export type UserEntry = {
  kind: 'user'
  id: string
  at: number
  text: string
  user?: UserIdentity
  /**
   * The name of the persona whose turn this waits for. Present while the message
   * is queued, absent once it is sent; it is the only thing that differs.
   */
  queuedFor?: string
}

/**
 * A line the harness wrote in its own voice, such as a handoff notice. It has no
 * agent, name, portrait or time: nothing about it can be mistaken for a persona.
 */
export type SyslineEntry = {
  kind: 'sysline'
  id: string
  at: number
  text: string
}

export type TranscriptEntry = PersonaEntry | UserEntry | SyslineEntry

