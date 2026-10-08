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
/** A menu entry activated: a session and a code go to main, which decides what to write. */
export const MENU_DISPATCH_CHANNEL = 'menu:dispatch'
/** A run's stop pressed: its id goes to main, which finds the run's session by it. */
export const RUN_STOP_CHANNEL = 'run:stop'
export const SESSION_EVENT_CHANNEL = 'session:event'
export const CONVERSATION_GET_CHANNEL = 'conversation:get'
export const CONVERSATION_END_CHANNEL = 'conversation:end'
/**
 * Which run's card a window is to show: main pushes the run's id to that one
 * window after raising it, like `doc:closed`, a push outside the session events.
 */
export const RUN_REVEALED_CHANNEL = 'run:revealed'

/**
 * The Welcome window's four: the recent list it is shown, the native folder
 * chooser, a recent row opened and a dropped folder opened. Each is a request
 * the Welcome makes; nothing is pushed to it. No channel takes anything but a
 * path the Welcome was shown or was handed by a drop.
 */
export const WELCOME_RECENT_CHANNEL = 'welcome:recent'
export const WELCOME_CHOOSE_CHANNEL = 'welcome:choose'
export const WELCOME_OPEN_RECENT_CHANNEL = 'welcome:open-recent'
export const WELCOME_OPEN_DROPPED_CHANNEL = 'welcome:open-dropped'

/**
 * The theme's three: the state a window asks for (synchronously, so the page is
 * painted before its first frame), the state main pushes to every window when
 * the choice or the OS appearance changes, and the one choice the Welcome makes.
 * The first two reach every kind of window; only the Welcome's choose is heard.
 */
export const THEME_STATE_CHANNEL = 'theme:state'
export const THEME_CHANGED_CHANNEL = 'theme:changed'
export const THEME_CHOOSE_CHANNEL = 'theme:choose'
