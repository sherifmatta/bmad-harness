import { useCallback, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import type { ProseStore } from '../chat/prose-store'
import { artParamsFor } from '../persona/art-params'
import { portrait } from '../persona/portrait'
import { useNow } from '../outputs/use-now'
import { formatElapsed } from '../status/format-elapsed'
import { COUNTER_TICK_MS, StateLine } from '../status/status-dot'
import type { AgentRow, AgentRun } from './board-agents'

/**
 * The Agents panel (Story 6.6): one row per installed persona, in roster order,
 * with the tile's portrait, name, title, dot and word. A persona on a run reads
 * the run's menu code, the path of the document its card shows and the run's
 * elapsed, which ticks each second; one in a turn that is not a run reads
 * `in a turn`; any other state adds nothing beyond its word. A row is text,
 * not a control: no handler, no tab stop, no live region, no tooltip. A state
 * change or a run starting or ending replaces the row's text in one render.
 */
export function AgentsPanel({ rows, prose }: { rows: readonly AgentRow[]; prose?: ProseStore | undefined }): JSX.Element {
  return (
    <section className="board-agents">
      <h3 className="board-agents-head">agents</h3>
      <ul className="board-agent-rows">
        {rows.map(({ agent, state, run }) => (
          <li className={`board-agent board-agent--${state}`} key={agent.id}>
            {portrait(artParamsFor(agent.id), 36, state, agent)}
            <span className="board-agent-who">
              <span className="board-agent-ident">
                <span className="board-agent-name">{agent.name}</span>
                <span className="board-agent-title">{agent.title}</span>
              </span>
              <StateLine state={state} />
              {state === 'work' && (run === undefined ? <span className="board-agent-run">in a turn</span> : <RunLine key={run.runId} run={run} prose={prose} />)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The run's code, its subject path while there is one, and its elapsed. Mounted only for a run in flight, so its timer exists only then. */
function RunLine({ run, prose }: { run: AgentRun; prose: ProseStore | undefined }): JSX.Element {
  const { runId } = run
  const subscribe = useCallback((listener: () => void) => prose?.subscribe(runId, listener) ?? (() => {}), [prose, runId])
  const pathOf = (): string => prose?.get(runId)?.path ?? ''
  const path = useSyncExternalStore(subscribe, pathOf, pathOf)
  const now = useNow(COUNTER_TICK_MS)
  const words = [run.code, path === '' ? undefined : path, formatElapsed(now - run.startedAt)].filter(
    (word): word is string => word !== undefined && word !== ''
  )
  return <span className="board-agent-run">{words.join(' ')}</span>
}
