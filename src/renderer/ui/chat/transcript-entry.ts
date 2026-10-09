import type { RunCardNote, RunCardStep, RunStatus } from '../../../shared/conversation'
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
  /** Said in the room (Story 4.2): the party thread draws it and a 1:1 thread never does. */
  room?: true
}

export type UserEntry = {
  kind: 'user'
  id: string
  at: number
  text: string
  /**
   * The literal `@name` the user typed to hand off to this persona (AD-25), drawn as a chip before the words.
   * Display only: the persona got `text` alone. Absent on every other turn.
   */
  mention?: string
  user?: UserIdentity
  /**
   * The name of the persona whose turn this waits for. Present while the message
   * is queued, absent once it is sent; it is the only thing that differs.
   */
  queuedFor?: string
  /** Sent into the room (Story 4.2): the party thread draws it and a 1:1 thread never does. */
  room?: true
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
  /**
   * The line is one the harness said about a room (Story 4.1), whether it opened, its
   * turns or its process: it belongs to the party thread, which draws only these, and
   * a persona's 1:1 thread never draws one.
   */
  room?: true
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
  /** The run's tool steps, as main's card holds them: by fold order against the notes (`RunCardStep.notesBefore`). Drawn by Story 3.17. */
  steps: readonly RunCardStep[]
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

