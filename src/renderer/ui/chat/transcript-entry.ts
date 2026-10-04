import type { RunCardNote, RunStatus } from '../../../shared/conversation'
import type { AgentView, HarnessError } from '../../../shared/install'

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

/**
 * A run's card, in time order among the turns: born on `run:started`, folded
 * from the run's own events, and ended by its terminal one. Its document text
 * is not here: prose is held apart in the prose store and written to the page
 * once a frame, so no piece of it is a state change.
 */
export type RunCardEntry = {
  kind: 'run'
  /** The run's id, which is also its key. */
  id: string
  /** `run:started.at`: where the card sits, and what elapsed counts from. */
  at: number
  runId: string
  sessionId: string
  agentId?: string
  status: RunStatus
  endedAt?: number
  error?: HarnessError
  notes: readonly RunCardNote[]
  /**
   * The section names the run is predicted to write, in order: what the skill's
   * template gave at dispatch and the Adapt-In names its notes pulled in. Absent
   * when the skill had no readable template.
   */
  plan?: readonly string[]
  /** The sections of each document the run confirmed a write to, by path. Its text is the prose store's. */
  documents: readonly RunCardEntryDocument[]
}

/** One document's sections, as a card's entry holds them: those of the path's last confirmed write. */
export type RunCardEntryDocument = { path: string; sections: readonly string[] }

export type TranscriptEntry = PersonaEntry | UserEntry | SyslineEntry | RunCardEntry

