import type { BoardSnapshot } from '../../../shared/board'
import type { ConversationSnapshot } from '../../../shared/conversation'
import type { ContractEvent } from '../../../shared/events'
import type { InstallSnapshot } from '../../../shared/install'
import type { RailSnapshot } from '../../../shared/rail'

/**
 * A fake `window.harness` for a whole-App mount (Story 7.6): the bridge the epic's mounted audit drives
 * the real `App` through. It answers what the window asks from plain values the test sets, records every call the
 * window makes (by method, in order) so a test can say what was never asked, and hands the test the listeners the
 * window subscribed so it can push an event, an install snapshot, a rail or a Board as main would.
 *
 * The values it answers with are the test's to build from the real folds; nothing here invents one. Test support
 * only: nothing the product ships imports it.
 */
export type FakeBridge = {
  /** Every bridge method the window called, by name, in order. */
  calls: string[]
  /** The ids of the sessions the window asked main to close. */
  closed: string[]
  /** The ids of the sessions the window asked main to stop the turn of. */
  stopped: string[]
  /** The agent ids the window asked main to open a seat for. */
  opened: string[]
  /** The `[session, text, mention?]` turns the window sent. */
  sent: ([string, string] | [string, string, string])[]
  /** The first messages the New session chat sent. */
  firsts: string[]
  /** The documents the window asked main to open. */
  docs: string[]
  /** The projects the window asked main to end the conversation of. */
  ended: string[]
  /** What `getConversation` answers with. */
  conversation: () => ConversationSnapshot
  /** What `getBoard` answers with. */
  board: () => Promise<BoardSnapshot>
  /** What `getRail` answers with: an empty rail over a neutral folder, which a test sets as it needs. */
  rail: RailSnapshot
  /** What `openSession` answers a `{ first }` with. */
  firstAnswer: (text: string) => unknown
  /** Push one contract event to every window listener, as main does. */
  push: (event: ContractEvent) => void
  /** Push a new install snapshot to every window listener. */
  pushInstall: (snapshot: InstallSnapshot) => void
  /** Put it at `window.harness`. */
  install: () => void
  /** Take it away again. */
  uninstall: () => void
}

/** A bridge over this install, with an empty conversation, no sprint status and an empty rail. */
export function createFakeBridge(install: InstallSnapshot): FakeBridge {
  const sessionListeners: ((event: ContractEvent) => void)[] = []
  const installListeners: ((next: InstallSnapshot) => void)[] = []
  const state: FakeBridge = {
    calls: [],
    closed: [],
    stopped: [],
    opened: [],
    sent: [],
    firsts: [],
    docs: [],
    ended: [],
    conversation: () => ({ entries: [], sessions: [], busy: [], personas: [], runs: [] }),
    board: async () => ({ revision: 1, kind: 'none', code: 'board/absent', message: 'board · no sprint status' }),
    rail: { revision: 1, folder: 'out/', rows: [] } as unknown as RailSnapshot,
    firstAnswer: (text) => {
      throw { code: 'session/no-skill', message: `no skill named ${text.split(/\s+/)[0].replace(/^\//, '')}` }
    },
    push: (event) => sessionListeners.forEach((listener) => listener(event)),
    pushInstall: (snapshot) => installListeners.forEach((listener) => listener(snapshot)),
    install: () => {
      Object.defineProperty(window, 'harness', { value: bridge, configurable: true, writable: true })
    },
    uninstall: () => {
      Object.defineProperty(window, 'harness', { value: undefined, configurable: true, writable: true })
    }
  }
  const called =
    <Args extends unknown[], Result>(name: string, body: (...args: Args) => Result) =>
    (...args: Args): Result => {
      state.calls.push(name)
      return body(...args)
    }
  const bridge = {
    getProjectPath: called('getProjectPath', async () => '/work/falcon'),
    getInstall: called('getInstall', async () => install),
    onInstallChanged: called('onInstallChanged', (listener: (next: InstallSnapshot) => void) => {
      installListeners.push(listener)
      return () => {}
    }),
    getBranch: called('getBranch', async () => 'main'),
    getRail: called('getRail', async () => state.rail),
    onRailChanged: called('onRailChanged', () => () => {}),
    getBoard: called('getBoard', () => state.board()),
    onBoardChanged: called('onBoardChanged', () => () => {}),
    openDoc: called('openDoc', async (path: string) => {
      state.docs.push(path)
    }),
    onDocClosed: called('onDocClosed', () => () => {}),
    dispatchMenu: called('dispatchMenu', async () => 'r-dispatched'),
    openSession: called('openSession', async (target: string | { room: readonly string[] } | { first: string }) => {
      if (typeof target !== 'string' && 'first' in target) {
        state.firsts.push(target.first)
        return state.firstAnswer(target.first)
      }
      if (typeof target !== 'string') {
        return { sessionId: 'session-of-the-room', room: { cast: [...target.room], openedAt: 1_700_000_000_000 } }
      }
      state.opened.push(target)
      // Main answers an open of a persona that has a live seat with that seat's own session.
      const held = state.conversation().sessions.find(({ agentId }) => agentId === target)
      return { sessionId: held?.sessionId ?? `session-of-${target}` }
    }),
    closeSession: called('closeSession', async (sessionId: string) => {
      state.closed.push(sessionId)
    }),
    sendTurn: called('sendTurn', async (sessionId: string, text: string, mention?: string) => {
      state.sent.push(mention === undefined ? [sessionId, text] : [sessionId, text, mention])
    }),
    stopRun: called('stopRun', async () => {}),
    stopTurn: called('stopTurn', async (sessionId: string) => {
      state.stopped.push(sessionId)
    }),
    getConversation: called('getConversation', async () => state.conversation()),
    endConversation: called('endConversation', async (projectId: string) => {
      state.ended.push(projectId)
    }),
    onSessionEvent: called('onSessionEvent', (listener: (event: ContractEvent) => void) => {
      sessionListeners.push(listener)
      return () => {}
    }),
    onRunRevealed: called('onRunRevealed', () => () => {})
  }
  return state
}
