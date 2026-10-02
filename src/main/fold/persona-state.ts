import type { ContractEvent, PersonaState } from '../../shared/events'
import type { AgentId, EpochMs, SessionId } from '../../shared/ids'
import type { RailRow, RailSnapshot } from '../../shared/rail'

/**
 * A persona's state, folded from what happened — pure, immutable, with the
 * clock injected and no I/O (FR103, FR104, UX-DR35).
 *
 * Each state has one source, and nothing sets a state for display:
 *
 * - `work`: some session of the agent has a turn in flight, from the session
 *   opening (the activation turn), a turn start or a run start until the
 *   session is awaiting a turn again. A quiet phase has no frames and stays
 *   `work` because nothing in it ends the turn.
 * - `error`: the agent's last run ended failed or stopped. Cleared by a run
 *   that finished, or by the agent's next turn start.
 * - `note`: an owned file changed or was removed between two rail snapshots. Cleared
 *   by the agent's next turn start. The first snapshot is a baseline and
 *   raises none.
 * - `live`: a session has an attached long-running process.
 * - `idle`: none of the above.
 *
 * Precedence is `work`, `error`, `note`, `live`, `idle`. A persona is the
 * aggregate of every session carrying its `agentId`; a session without one
 * belongs to the room and is ignored here.
 *
 * Three inputs are the harness's own and not contract events — a turn the user
 * sent, a process attached, a process detached — so they are declared here, in
 * the same `noun:verb-past` form, and never cross the bridge.
 */

/** What only main knows, in the contract's own form. `at` falls back to the injected clock. */
export type InternalEvent =
  | { name: 'turn:started'; payload: { sessionId: SessionId; at?: EpochMs } }
  | { name: 'process:attached'; payload: { sessionId: SessionId; at?: EpochMs } }
  | { name: 'process:detached'; payload: { sessionId: SessionId; at?: EpochMs } }

/** Everything the fold reads. */
export type PersonaInput = ContractEvent | InternalEvent

type SessionFlags = { agentId: AgentId; working: boolean; live: boolean }

/** What outlives a session: the agent's last run and the files it owns. */
type AgentFlags = { error: boolean; note: boolean }

/** An owned row as the last snapshot showed it. */
type OwnedRow = { agentId: AgentId; signature: string }

/** An agent's aggregated state and the instant it began. */
export type ShownState = { state: PersonaState; at: EpochMs }

export type PersonaTable = {
  sessions: ReadonlyMap<SessionId, SessionFlags>
  agents: ReadonlyMap<AgentId, AgentFlags>
  /** Last aggregated state per agent the fold has seen; an absent agent is `idle`. */
  shown: ReadonlyMap<AgentId, ShownState>
  /** Owned rows by path, as of the last snapshot; `null` until the baseline is taken. */
  rail: ReadonlyMap<string, OwnedRow> | null
}

export const EMPTY_PERSONA_TABLE: PersonaTable = {
  sessions: new Map(),
  agents: new Map(),
  shown: new Map(),
  rail: null
}

function aggregate(table: PersonaTable, agentId: AgentId): PersonaState {
  let live = false
  for (const session of table.sessions.values()) {
    if (session.agentId !== agentId) continue
    if (session.working) return 'work'
    live ||= session.live
  }
  const flags = table.agents.get(agentId)
  if (flags?.error === true) return 'error'
  if (flags?.note === true) return 'note'
  return live ? 'live' : 'idle'
}

/** The state of one agent now. */
export function stateOfAgent(table: PersonaTable, agentId: AgentId): PersonaState {
  return table.shown.get(agentId)?.state ?? 'idle'
}

/** Record each touched agent's aggregate, stamped `at` only where it actually changed. */
function settled(table: PersonaTable, touched: Iterable<AgentId>, at: EpochMs): PersonaTable {
  let shown: Map<AgentId, ShownState> | null = null
  for (const agentId of new Set(touched)) {
    const state = aggregate(table, agentId)
    if (state !== stateOfAgent(table, agentId)) {
      shown ??= new Map(table.shown)
      shown.set(agentId, { state, at })
    }
  }
  return shown === null ? table : { ...table, shown }
}

function withSession(table: PersonaTable, sessionId: SessionId, flags: SessionFlags): PersonaTable {
  return { ...table, sessions: new Map(table.sessions).set(sessionId, flags) }
}

function withAgent(table: PersonaTable, agentId: AgentId, patch: Partial<AgentFlags>): PersonaTable {
  const current = table.agents.get(agentId) ?? { error: false, note: false }
  return { ...table, agents: new Map(table.agents).set(agentId, { ...current, ...patch }) }
}

/** A turn began for the agent: it is working, and what it last reported is no longer news. */
function startTurn(
  table: PersonaTable,
  sessionId: SessionId,
  flags: SessionFlags,
  at: EpochMs
): PersonaTable {
  const started = withAgent(withSession(table, sessionId, { ...flags, working: true }), flags.agentId, {
    error: false,
    note: false
  })
  return settled(started, [flags.agentId], at)
}

function signatureOf(row: RailRow): string {
  return row.state === 'saved' ? `saved:${row.savedAt}` : row.state
}

function ownedRows(snapshot: RailSnapshot): Map<string, OwnedRow> {
  const owned = new Map<string, OwnedRow>()
  for (const row of snapshot.rows) {
    if (row.owner !== undefined) {
      owned.set(row.path, { agentId: row.owner.agentId, signature: signatureOf(row) })
    }
  }
  return owned
}

/** Take the first snapshot as the baseline: it raises no `note`. Later calls change nothing. */
export function seedRail(table: PersonaTable, snapshot: RailSnapshot): PersonaTable {
  return table.rail === null ? { ...table, rail: ownedRows(snapshot) } : table
}

/**
 * An owned row that is new, whose disk state differs, or that is gone since the
 * last snapshot: the watcher saw a change to a file the persona owns.
 */
function foldRail(table: PersonaTable, snapshot: RailSnapshot, at: EpochMs): PersonaTable {
  const before = table.rail
  const now = ownedRows(snapshot)
  const baseline: PersonaTable = { ...table, rail: now }
  if (before === null) {
    return baseline
  }
  let next = baseline
  const touched = new Set<AgentId>()
  const raise = (agentId: AgentId): void => {
    if (next.agents.get(agentId)?.note !== true) {
      next = withAgent(next, agentId, { note: true })
      touched.add(agentId)
    }
  }
  for (const [path, row] of now) {
    if (before.get(path)?.signature !== row.signature) raise(row.agentId)
  }
  for (const [path, row] of before) {
    if (!now.has(path)) raise(row.agentId)
  }
  return settled(next, touched, at)
}

/**
 * Fold one input into the table. Inputs about a session the table does not
 * know are ignored: a session exists from `session:opened` to `session:closed`.
 */
export function foldPersonaState(table: PersonaTable, input: PersonaInput, now: EpochMs): PersonaTable {
  switch (input.name) {
    case 'session:opened': {
      const { sessionId, agentId } = input.payload
      if (agentId === undefined) return table
      // The activation turn is in flight until the session says it is awaiting.
      return startTurn(table, sessionId, { agentId, working: false, live: false }, input.payload.at)
    }

    case 'turn:started':
    case 'run:started': {
      const flags = table.sessions.get(input.payload.sessionId)
      if (flags === undefined) return table
      return startTurn(table, input.payload.sessionId, flags, input.payload.at ?? now)
    }

    case 'session:awaiting-turn': {
      const flags = table.sessions.get(input.payload.sessionId)
      if (flags === undefined || !flags.working) return table
      return settled(
        withSession(table, input.payload.sessionId, { ...flags, working: false }),
        [flags.agentId],
        input.payload.at
      )
    }

    case 'session:closed': {
      const flags = table.sessions.get(input.payload.sessionId)
      if (flags === undefined) return table
      const sessions = new Map(table.sessions)
      sessions.delete(input.payload.sessionId)
      return settled({ ...table, sessions }, [flags.agentId], input.payload.at)
    }

    case 'process:attached':
    case 'process:detached': {
      const flags = table.sessions.get(input.payload.sessionId)
      const live = input.name === 'process:attached'
      if (flags === undefined || flags.live === live) return table
      return settled(
        withSession(table, input.payload.sessionId, { ...flags, live }),
        [flags.agentId],
        input.payload.at ?? now
      )
    }

    case 'run:failed':
    case 'run:stopped':
    case 'run:finished': {
      const flags = table.sessions.get(input.payload.sessionId)
      if (flags === undefined) return table
      const error = input.name !== 'run:finished'
      if ((table.agents.get(flags.agentId)?.error ?? false) === error) return table
      return settled(withAgent(table, flags.agentId, { error }), [flags.agentId], input.payload.at)
    }

    case 'rail:changed':
      return foldRail(table, input.payload, now)

    default:
      return table
  }
}
