/**
 * Every IPC channel the harness speaks, spelled once. Main registers on these
 * and the two preloads invoke and listen on them, so a name cannot change on one
 * side alone. Each bridge re-exports its own, so the tests that tie a bridge to
 * its preload keep reading it from the bridge.
 *
 * Constants only, no behaviour. A preload is a sandboxed script that cannot load
 * a second file, so the build inlines this module into each preload bundle.
 */

/** The project the window was opened for. */
export const PROJECT_PATH_CHANNEL = 'project:path'
export const PROJECT_BRANCH_CHANNEL = 'project:branch'

export const INSTALL_GET_CHANNEL = 'install:get'
export const INSTALL_CHANGED_CHANNEL = 'install:changed'

export const RAIL_GET_CHANNEL = 'rail:get'
export const RAIL_CHANGED_CHANNEL = 'rail:changed'

/** The shell's two document channels, then the document window's five. */
export const DOC_OPEN_CHANNEL = 'doc:open'
export const DOC_CLOSED_CHANNEL = 'doc:closed'
export const DOC_GET_CHANNEL = 'doc:get'
export const DOC_CHANGED_CHANNEL = 'doc:changed'
export const DOC_REVEAL_CHANNEL = 'doc:reveal'
export const DOC_EDIT_CHANNEL = 'doc:open-in-editor'
export const DOC_CLOSE_CHANNEL = 'doc:close'

/**
 * Every session event travels on the one `session:event` channel as
 * `{name, payload}`. `conversation:get` is the read a window makes on
 * connecting and `conversation:end` the one command that clears a conversation.
 */
export const SESSION_OPEN_CHANNEL = 'session:open'
export const SESSION_CLOSE_CHANNEL = 'session:close'
export const TURN_SEND_CHANNEL = 'turn:send'
export const SESSION_EVENT_CHANNEL = 'session:event'
export const CONVERSATION_GET_CHANNEL = 'conversation:get'
export const CONVERSATION_END_CHANNEL = 'conversation:end'
