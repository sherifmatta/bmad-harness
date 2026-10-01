/**
 * The identifiers the contract keys things by. Types only, like the rest of
 * `shared/`.
 *
 * `sessionId` keys everything that belongs to one running conversation and
 * `runId` everything that belongs to one run inside it. A persona is always
 * keyed by `agentId`, never by display name. `agentId` is optional wherever a
 * session owns the payload, because a party session belongs to the room and has
 * no single persona.
 */

/** One conversation with the CLI. Turns inside it are serialised. */
export type SessionId = string

/** One menu run inside a session. A chat turn has none. */
export type RunId = string

/** The roster's id for one installed persona. */
export type AgentId = string

/** The project a transcript belongs to, keyed by its path. */
export type ProjectId = string

/** One tool call, as the model addressed it. Pairs a document's parts. */
export type CallId = string

/** The model's own id for one message, so a turn can be told from the next. */
export type MessageId = string

/** Epoch milliseconds. Formatting is the renderer's concern. */
export type EpochMs = number
